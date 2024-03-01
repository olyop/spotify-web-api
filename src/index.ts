import { deleteStoredPKCEVerifier, generatePKCEChallenge, retrieveStoredPKCEVerifierAndDelete } from "./utilities";
import {
	AccessToken,
	AccessTokenResponse,
	LOCAL_STORAGE_TOKEN_KEY,
	SpotifyInternalOptions,
	SpotifyOptions,
	SpotifyQueryHttpMethod,
	SpotifyQueryRequestData,
} from "./values";

export type { SpotifyInternalOptions, SpotifyOptions, SpotifyQueryHttpMethod, SpotifyQueryRequestData };

export class SpotifyWebApiClient implements SpotifyWebApiClientInter {
	#OPTIONS: SpotifyInternalOptions;

	#abortController: AbortController = new AbortController();

	#codeVerifier: string | null;
	#authorizationCode: string | null;
	#token: AccessToken | null;
	#isLoading: boolean;
	#error: Error | null;

	constructor(optionsInput: SpotifyOptions) {
		this.#OPTIONS = this.#toInternalOptions(optionsInput);
		this.#codeVerifier = retrieveStoredPKCEVerifierAndDelete();
		this.#authorizationCode = optionsInput.authorizationCode ?? null;
		this.#token = SpotifyWebApiClient.#retrieveStoredToken();
		this.#isLoading = false;
		this.#error = null;

		if (optionsInput.authorizationCode) {
			void this.#initialRetrieveAccessToken(optionsInput.onAuthenticatedChange);
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

	async #handleLogin() {
		try {
			await this.#redirectToAuthCodeFlow(this.#OPTIONS);
		} finally {
			this.isLoading = false;
		}
	}

	logout() {
		if (!this.isAuthenticated) throw new Error("Authenticated");

		this.reset();

		this.#deleteToken();
		deleteStoredPKCEVerifier();
	}

	reset() {
		this.#abortController.abort();

		this.#abortController = new AbortController();
		this.#codeVerifier = retrieveStoredPKCEVerifierAndDelete();
		this.#authorizationCode = null;
		this.#token = SpotifyWebApiClient.#retrieveStoredToken();
		this.#isLoading = false;
	}

	async #initialRetrieveAccessToken(onAuthenticatedChange?: (isAuthenticated: boolean) => void) {
		this.isLoading = true;

		await this.#retrieveAccessToken();

		onAuthenticatedChange?.(true);

		this.isLoading = false;
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

	async #getAccessToken(): Promise<string> {
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

		const accessToken: AccessToken = {
			accessToken: access_token,
			tokenType: token_type,
			scope,
			expiresAt: Date.now() + expires_in * 1000,
			refreshToken: refresh_token,
		};

		return accessToken;
	}

	async #redirectToAuthCodeFlow(options: SpotifyInternalOptions) {
		const codeChallenge = await generatePKCEChallenge();

		const url = new URL("https://accounts.spotify.com/authorize");

		url.searchParams.append("client_id", options.clientId);
		url.searchParams.append("response_type", "code");
		url.searchParams.append("redirect_uri", options.redirectUri);
		url.searchParams.append("scope", options.scope);
		url.searchParams.append("code_challenge_method", "S256");
		url.searchParams.append("code_challenge", codeChallenge);

		window.location.href = url.toString();
	}

	#setToken(token: AccessToken) {
		localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, JSON.stringify(token));

		this.#token = token;

		this.#OPTIONS.onAuthenticatedChange?.(true);
	}

	static #retrieveStoredToken() {
		const tokenJson = localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY);

		if (tokenJson === null) {
			return null;
		}

		return JSON.parse(tokenJson) as AccessToken;
	}

	static isAuthenticatedInitial() {
		return this.#retrieveStoredToken() !== null;
	}

	#deleteToken() {
		this.#token = null;
		localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
	}

	#toInternalOptions({ clientId, redirectUri, scope }: SpotifyOptions) {
		const internalOptions: SpotifyInternalOptions = {
			clientId,
			redirectUri,
			scope: scope.join(" "),
		};

		return internalOptions;
	}
}

export type SpotifyWebApiClientQuery = <T>(
	method: SpotifyQueryHttpMethod,
	path: string,
	data?: SpotifyQueryRequestData,
) => Promise<T>;

export interface SpotifyWebApiClientState {
	isAuthenticated: boolean;
	isLoading: boolean;
	error: Error | null;
}

export interface SpotifyWebApiClientLogInOut {
	login: () => void;
	logout: () => void;
}

export interface SpotifyWebApiClientMethods extends SpotifyWebApiClientLogInOut {
	query: SpotifyWebApiClientQuery;
}

interface SpotifyWebApiClientInter extends SpotifyWebApiClientState, SpotifyWebApiClientMethods {}
