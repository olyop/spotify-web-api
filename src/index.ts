// eslint-disable-next-line unicorn/prevent-abbreviations
import { IndexedDbProvider } from "./indexed-db-provider";
import { LocalStorageProvider } from "./local-storage-provider";
import {
	AccessTokenResponse,
	SpotifyAuthorizationCodeOptions,
	SpotifyHooksOptions,
	SpotifyOAuthConfiguration,
	SpotifyOAuthOptions,
	SpotifyOptions,
	SpotifyQueryHttpMethod,
	SpotifyToken,
	SpotifyWebApiClientInter,
	SpotifyWebApiClientLogInOut,
	SpotifyWebApiClientMethods,
	SpotifyWebApiClientQuery,
	SpotifyWebApiClientQueryOptions,
	SpotifyWebApiClientState,
	StorageProvider,
	StorageProviderKeys,
} from "./types";
import { anySignal, deletePKCEVerifier, generatePKCEChallenge, retrievePKCEVerifier, sleep } from "./utilities";

export * from "spotify-types";

export class SpotifyWebApiClient implements SpotifyWebApiClientInter {
	#OPTIONS: SpotifyOptions;

	#abortController: AbortController;

	#token: SpotifyToken | null;
	#error: Error | null;

	constructor(optionsInput: SpotifyOptions) {
		this.#OPTIONS = optionsInput;

		this.#abortController = new AbortController();

		this.#token = null;
		this.#error = null;

		if (this.#OPTIONS.token) {
			this.#token = this.#OPTIONS.token;
		} else if (this.#OPTIONS.storageProvider) {
			this.#token = this.#OPTIONS.storageProvider.getToken();

			if (this.#OPTIONS.shouldAutoLogin && (this.#token === null || this.#token.expiresAt < Date.now())) {
				if (!this.#OPTIONS.authorizationCode) throw new Error("No authorization code found");

				const codeVerifier = retrievePKCEVerifier(this.#OPTIONS.storageProvider);

				if (!codeVerifier) throw new Error("No code verifier found");

				void this.#initialRetrieveAccessToken(codeVerifier, this.#OPTIONS.authorizationCode);
			}
		}
	}

	get isAuthenticated() {
		return this.#token !== null;
	}

	get error() {
		return this.#error;
	}

	login() {
		if (this.isAuthenticated) throw new Error("Authenticated");

		this.reset();

		void this.#redirectToAuthCodeFlow();
	}

	logout() {
		if (!this.isAuthenticated) throw new Error("Authenticated");

		this.reset();

		this.#deleteToken();

		if (this.#OPTIONS.storageProvider) {
			deletePKCEVerifier(this.#OPTIONS.storageProvider);
		}
	}

	reset() {
		this.#abortController.abort();

		this.#abortController = new AbortController();

		this.#token = null;
		this.#error = null;

		if (this.#OPTIONS.storageProvider) {
			this.#token = this.#OPTIONS.storageProvider.getToken();
		}
	}

	static isAuthenticatedInitial(storageProvider: StorageProvider) {
		return storageProvider.getToken() !== null;
	}

	setOptions(options: Partial<SpotifyOptions>) {
		this.#OPTIONS = {
			...this.#OPTIONS,
			...options,
		};
	}

	async query<T>(method: SpotifyQueryHttpMethod, path: string, options?: SpotifyWebApiClientQueryOptions): Promise<T> {
		const url = new URL(`https://api.spotify.com/v1/${path}`);

		if (options?.searchParams) {
			for (const [key, value] of options.searchParams) {
				url.searchParams.append(key, value);
			}
		}

		const isJSON = options?.body !== undefined;

		if (this.#OPTIONS.cacheProvider && !isJSON) {
			const cached = await this.#OPTIONS.cacheProvider.get(url.toString());

			if (cached !== null) {
				return JSON.parse(cached) as T;
			}
		}

		const body = isJSON ? JSON.stringify(options.body) : null;

		const request = new Request(url, { method, body });

		if (isJSON) {
			request.headers.append("Content-Type", "application/json");
		}

		const signals: AbortSignal[] = [this.#abortController.signal];

		if (options?.signal) {
			signals.push(options.signal);
		}

		const signal = anySignal(signals);

		let accessToken: string;

		if (this.#token) {
			if (this.#token.expiresAt < Date.now()) {
				accessToken = await this.#retreiveRefreshToken(signal);
			} else {
				accessToken = this.#token.accessToken;
			}
		} else {
			if (!this.#OPTIONS.storageProvider) throw new Error("No storage provider found");
			if (!this.#OPTIONS.authorizationCode) throw new Error("No authorization code found");

			const codeVerifier = retrievePKCEVerifier(this.#OPTIONS.storageProvider);

			if (!codeVerifier) throw new Error("No code verifier found");

			accessToken = await this.#initialRetrieveAccessToken(codeVerifier, this.#OPTIONS.authorizationCode);
		}

		request.headers.append("Authorization", `Bearer ${accessToken}`);

		const response = await fetch(request, { signal });

		if (!response.ok) {
			// check for rate limit
			const retryAfterHeader = response.headers.get("Retry-After");

			if (retryAfterHeader === null) {
				throw new Error(`Failed to query: ${response.statusText}`);
			}

			const retryAfter = Number.parseInt(retryAfterHeader); // seconds

			await sleep(retryAfter * 1000);

			return this.query<T>(method, path, options);
		}

		const text = await response.text();

		// check if has content
		if (text.length === 0) {
			throw new Error("No content");
		}

		return JSON.parse(text) as T;
	}

	async #redirectToAuthCodeFlow() {
		if (!this.#OPTIONS.storageProvider) throw new Error("No storage provider found");

		const codeChallenge = await generatePKCEChallenge(this.#OPTIONS.storageProvider);

		const url = new URL("https://accounts.spotify.com/authorize");

		url.searchParams.append("client_id", this.#OPTIONS.clientId);
		url.searchParams.append("response_type", "code");
		url.searchParams.append("redirect_uri", this.#OPTIONS.redirectUri);
		url.searchParams.append("scope", this.#OPTIONS.scope);
		url.searchParams.append("code_challenge_method", "S256");
		url.searchParams.append("code_challenge", codeChallenge);

		window.location.href = url.toString();
	}

	async #initialRetrieveAccessToken(codeVerifier: string, authorizationCode: string) {
		const accessToken = await this.#retrieveAccessToken(codeVerifier, authorizationCode);

		this.#OPTIONS.onAuthenticatedChange?.(true);

		return accessToken;
	}

	async #retrieveAccessToken(codeVerifier: string, authorizationCode: string) {
		const url = new URL("https://accounts.spotify.com/api/token");

		url.searchParams.append("client_id", this.#OPTIONS.clientId);
		url.searchParams.append("grant_type", "authorization_code");
		url.searchParams.append("code", authorizationCode);
		url.searchParams.append("redirect_uri", this.#OPTIONS.redirectUri);
		url.searchParams.append("code_verifier", codeVerifier);

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

	async #retreiveRefreshToken(signal: AbortSignal) {
		if (this.#token === null) throw new Error("No token found");

		const url = new URL("https://accounts.spotify.com/api/token");

		url.searchParams.append("client_id", this.#OPTIONS.clientId);
		url.searchParams.append("grant_type", "refresh_token");
		url.searchParams.append("refresh_token", this.#token.refreshToken);

		const request = new Request(url, {
			method: "POST",
		});

		request.headers.append("Content-Type", "application/x-www-form-urlencoded");

		const response = await fetch(request, { signal });

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

		this.#OPTIONS.storageProvider?.setToken(token);

		this.#OPTIONS.onAuthenticatedChange?.(true);
	}

	#deleteToken() {
		this.#token = null;

		this.#OPTIONS.storageProvider?.removeToken();

		this.#OPTIONS.onAuthenticatedChange?.(false);
	}
}

export { LocalStorageProvider, IndexedDbProvider };

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
	SpotifyWebApiClientQueryOptions,
	SpotifyWebApiClientLogInOut,
	SpotifyWebApiClientMethods,
	SpotifyWebApiClientQuery,
	SpotifyWebApiClientState,
};
