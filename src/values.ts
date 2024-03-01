export const PKCE_VERIFIER_POSSIBLE_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export const LOCAL_STORAGE_TOKEN_KEY = "spotify-web-api.token";
export const LOCAL_STORAGE_PKCE_VERIFIER_KEY = "spotify-web-api.pkceverifier";

interface SpotifyBaseOptions {
	clientId: string;
	redirectUri: string;
	onLoadingChange?: (isLoading: boolean) => void;
	onAuthenticatedChange?: (isAuthenticated: boolean) => void;
	onError?: (error: Error) => void;
}

export interface SpotifyInternalOptions extends SpotifyBaseOptions {
	scope: string;
}

export interface SpotifyOptions extends SpotifyBaseOptions {
	scope: string[];
	authorizationCode?: string | null;
}

export interface AccessTokenResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
	refresh_token: string;
	scope: string;
}

export interface AccessToken {
	accessToken: string;
	tokenType: string;
	expiresAt: number;
	refreshToken: string;
	scope: string;
}

export type SpotifyQueryHttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
export type SpotifyQueryRequestData = URLSearchParams | Record<string, unknown>;
