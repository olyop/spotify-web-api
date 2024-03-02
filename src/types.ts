export const PKCE_VERIFIER_POSSIBLE_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export interface SpotifyWebApiClientInter extends SpotifyWebApiClientState, SpotifyWebApiClientMethods {}

export interface SpotifyWebApiClientState {
	isAuthenticated: boolean;
	isLoading: boolean;
	error: Error | null;
}

export interface SpotifyWebApiClientMethods extends SpotifyWebApiClientLogInOut {
	query: SpotifyWebApiClientQuery;
}

export interface SpotifyWebApiClientLogInOut {
	login: () => void;
	logout: () => void;
}

export type SpotifyWebApiClientQuery = <T>(
	method: SpotifyQueryHttpMethod,
	path: string,
	data?: SpotifyQueryRequestData,
) => Promise<T>;

export interface SpotifyOptions extends SpotifyAuthorizationCodeOptions, SpotifyOAuthOptions, SpotifyHooksOptions {
	storageProvider?: StorageProvider | null;
}

export interface SpotifyAuthorizationCodeOptions {
	authorizationCode: string | null;
}

export interface SpotifyOAuthOptions extends SpotifyOAuthConfiguration {
	token?: SpotifyToken;
}

export interface SpotifyOAuthConfiguration {
	clientId: string;
	redirectUri: string;
	scope: string;
}

export interface SpotifyHooksOptions {
	onLoadingChange?: (isLoading: boolean) => void;
	onAuthenticatedChange?: (isAuthenticated: boolean) => void;
	onErrorChange?: (error: Error) => void;
}

export type SpotifyQueryHttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
export type SpotifyQueryRequestData = URLSearchParams | Record<string, unknown>;

export interface StorageProvider {
	getToken(): SpotifyToken | null;
	getPKCEVerifier(): string | null;
	setToken(token: SpotifyToken): void;
	setPKCEVerifier(pkceVerifier: string): void;
	removeToken(): void;
	removePKCEVerifier(): void;
}

export interface StorageProviderKeys {
	token: string;
	pkceVerifier: string;
}

export interface AccessTokenResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
	refresh_token: string;
	scope: string;
}

export interface SpotifyToken {
	accessToken: string;
	tokenType: string;
	expiresAt: number;
	refreshToken: string;
	scope: string;
}
