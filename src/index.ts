import { LocalStorageProvider } from "./local-storage";
import {
	AccessTokenResponse,
	SpotifyAuthorizationCodeOptions,
	SpotifyHooksOptions,
	SpotifyOAuthConfiguration,
	SpotifyOAuthOptions,
	SpotifyOptions,
	SpotifyQueryHttpMethod,
	SpotifyQueryRequestData,
	SpotifyToken,
	SpotifyWebApiClientInter,
	SpotifyWebApiClientLogInOut,
	SpotifyWebApiClientMethods,
	SpotifyWebApiClientQuery,
	SpotifyWebApiClientState,
	StorageProvider,
	StorageProviderKeys,
} from "./types";
import { deletePKCEVerifier, generatePKCEChallenge, retrievePKCEVerifier } from "./utilities";

export class SpotifyWebApiClient implements SpotifyWebApiClientInter {
	#OPTIONS: SpotifyOptions;

	#abortController: AbortController;
	#storageProvider: StorageProvider | null;

	#codeVerifier: string | null;
	#authorizationCode: string | null;
	#token: SpotifyToken | null;
	#isLoading: boolean;
	#error: Error | null;

	constructor(optionsInput: SpotifyOptions) {
		this.#OPTIONS = optionsInput;

		this.#abortController = new AbortController();

		this.#storageProvider = optionsInput.storageProvider === undefined ? new LocalStorageProvider() : null;

		this.#codeVerifier = null;
		this.#authorizationCode = null;
		this.#token = null;
		this.#isLoading = false;
		this.#error = null;

		if (this.#storageProvider) {
			this.#codeVerifier = retrievePKCEVerifier(this.#storageProvider);
			this.#token = SpotifyWebApiClient.#retrieveStoredToken(this.#storageProvider);
		}

		if (optionsInput.token) {
			this.#token = optionsInput.token;
		}

		if (optionsInput.authorizationCode) {
			this.#isLoading = true;
			this.#authorizationCode = optionsInput.authorizationCode;

			void this.#initialRetrieveAccessToken();
		}
	}

	get isAuthenticated() {
		return this.#token !== null;
	}

	get isLoading() {
		return this.#isLoading;
	}

	set isLoading(isLoading: boolean) {
		this.#isLoading = isLoading;
		this.#OPTIONS.onLoadingChange?.(isLoading);
	}

	get error() {
		return this.#error;
	}

	login() {
		if (this.isAuthenticated) throw new Error("Authenticated");

		this.reset();

		void this.#handleLogin();
	}

	logout() {
		if (!this.isAuthenticated) throw new Error("Authenticated");

		this.reset();

		this.#deleteToken();

		if (this.#storageProvider) {
			this.#storageProvider.removeItem(this.#storageProvider.keys.token);
			deletePKCEVerifier(this.#storageProvider);
		}
	}

	reset() {
		this.#abortController.abort();

		this.#abortController = new AbortController();
		this.#codeVerifier = this.#storageProvider ? retrievePKCEVerifier(this.#storageProvider) : null;
		this.#authorizationCode = null;
		this.#token = this.#storageProvider ? SpotifyWebApiClient.#retrieveStoredToken(this.#storageProvider) : null;
		this.#isLoading = false;
	}

	static isLoadingInitial(authorizationCode: string | null) {
		return authorizationCode !== null;
	}

	static isAuthenticatedInitial(storageProvider: StorageProvider) {
		return this.#retrieveStoredToken(storageProvider) !== null;
	}

	async query<T>(method: SpotifyQueryHttpMethod, path: string, data?: SpotifyQueryRequestData) {
		if (!this.isAuthenticated) throw new Error("Not authenticated");

		const url = new URL(`https://api.spotify.com/v1/${path}`);

		if (data instanceof URLSearchParams) {
			for (const [key, value] of data) {
				url.searchParams.append(key, value);
			}
		}

		const isJSON = data !== undefined && !(data instanceof URLSearchParams);

		const request = new Request(url, { method, body: isJSON ? JSON.stringify(data) : null });

		if (isJSON) {
			request.headers.append("Content-Type", "application/json");
		}

		const token = await this.#getAccessToken();

		request.headers.append("Authorization", `Bearer ${token}`);

		const response = await fetch(request, { signal: this.#abortController.signal });

		if (!response.ok) {
			throw new Error(response.statusText);
		}

		const text = await response.text();

		// check if has content
		if (text.length === 0) {
			return text as unknown as T;
		}

		return JSON.parse(text) as T;
	}

	static #retrieveStoredToken(storageProvider: StorageProvider) {
		const tokenJson = storageProvider.getItem(storageProvider.keys.token);

		if (tokenJson === null) {
			return null;
		}

		return JSON.parse(tokenJson) as SpotifyToken;
	}

	async #handleLogin() {
		this.isLoading = true;

		try {
			await this.#redirectToAuthCodeFlow();
		} finally {
			this.isLoading = false;
		}
	}

	async #redirectToAuthCodeFlow() {
		if (this.#storageProvider === null) throw new Error("No storage provider found");

		const codeChallenge = await generatePKCEChallenge(this.#storageProvider);

		const url = new URL("https://accounts.spotify.com/authorize");

		url.searchParams.append("client_id", this.#OPTIONS.clientId);
		url.searchParams.append("response_type", "code");
		url.searchParams.append("redirect_uri", this.#OPTIONS.redirectUri);
		url.searchParams.append("scope", this.#OPTIONS.scope);
		url.searchParams.append("code_challenge_method", "S256");
		url.searchParams.append("code_challenge", codeChallenge);

		window.location.href = url.toString();
	}

	async #initialRetrieveAccessToken() {
		await this.#retrieveAccessToken();

		this.#OPTIONS.onAuthenticatedChange?.(true);

		this.isLoading = false;
	}

	async #getAccessToken() {
		let accessToken: string;

		if (this.#token === null) {
			accessToken = await this.#retrieveAccessToken();
		} else if (this.#token.expiresAt < Date.now()) {
			accessToken = await this.#retreiveRefreshToken();
		} else {
			accessToken = this.#token.accessToken;
		}

		return accessToken;
	}

	async #retrieveAccessToken() {
		if (this.#authorizationCode === null) throw new Error("No authorization code found");
		if (this.#codeVerifier === null) throw new Error("No verifier found");

		const url = new URL("https://accounts.spotify.com/api/token");

		url.searchParams.append("client_id", this.#OPTIONS.clientId);
		url.searchParams.append("grant_type", "authorization_code");
		url.searchParams.append("code", this.#authorizationCode);
		url.searchParams.append("redirect_uri", this.#OPTIONS.redirectUri);
		url.searchParams.append("code_verifier", this.#codeVerifier);

		const request = new Request(url, {
			method: "POST",
		});

		request.headers.append("Content-Type", "application/x-www-form-urlencoded");

		const response = await fetch(request, { signal: this.#abortController.signal });

		if (!response.ok) {
			throw new Error(`Failed to retrieve access token: ${response.statusText}`);
		}

		const token = await this.#convertAccessTokenResponse(response);

		this.#setToken(token);

		return token.accessToken;
	}

	async #retreiveRefreshToken() {
		if (this.#token === null) throw new Error("No token found");

		const url = new URL("https://accounts.spotify.com/api/token");

		url.searchParams.append("client_id", this.#OPTIONS.clientId);
		url.searchParams.append("grant_type", "refresh_token");
		url.searchParams.append("refresh_token", this.#token.refreshToken);

		const request = new Request(url, {
			method: "POST",
		});

		request.headers.append("Content-Type", "application/x-www-form-urlencoded");

		const response = await fetch(request, { signal: this.#abortController.signal });

		if (!response.ok) {
			throw new Error(`Failed to refresh access token: ${response.statusText}`);
		}

		const token = await this.#convertAccessTokenResponse(response);

		this.#setToken(token);

		return token.accessToken;
	}

	async #convertAccessTokenResponse(response: Response) {
		const json = (await response.json()) as AccessTokenResponse;

		const { access_token, token_type, scope, expires_in, refresh_token } = json;

		const accessToken: SpotifyToken = {
			accessToken: access_token,
			tokenType: token_type,
			scope,
			expiresAt: Date.now() + expires_in * 1000,
			refreshToken: refresh_token,
		};

		return accessToken;
	}

	#setToken(token: SpotifyToken) {
		this.#token = token;

		this.#storageProvider?.setItem(this.#storageProvider.keys.token, JSON.stringify(token));

		this.#OPTIONS.onAuthenticatedChange?.(true);
	}

	#deleteToken() {
		this.#token = null;

		this.#storageProvider?.removeItem(this.#storageProvider.keys.token);

		this.#OPTIONS.onAuthenticatedChange?.(false);
	}
}

export { LocalStorageProvider };

export type {
	SpotifyToken,
	SpotifyHooksOptions,
	SpotifyAuthorizationCodeOptions,
	SpotifyOAuthConfiguration,
	SpotifyOAuthOptions,
	SpotifyOptions,
	SpotifyQueryHttpMethod,
	StorageProvider,
	StorageProviderKeys,
	SpotifyQueryRequestData,
	SpotifyWebApiClientLogInOut,
	SpotifyWebApiClientMethods,
	SpotifyWebApiClientQuery,
	SpotifyWebApiClientState,
};
