import { SpotifyToken, StorageProvider } from "./types";

const DEFAULT_STORAGE_KEY_PREFIX = "spotify-web-api";
const DEFAULT_STORAGE_TOKEN_KEY = `${DEFAULT_STORAGE_KEY_PREFIX}.token`;
const DEFAULT_STORAGE_PKCE_VERIFIER_KEY = `${DEFAULT_STORAGE_KEY_PREFIX}.pkceverifier`;

export class LocalStorageProvider implements StorageProvider {
	getToken(): SpotifyToken | null {
		const tokenJson = localStorage.getItem(DEFAULT_STORAGE_TOKEN_KEY);

		if (tokenJson === null) return null;

		return JSON.parse(tokenJson) as SpotifyToken;
	}

	getPKCEVerifier(): string | null {
		return localStorage.getItem(DEFAULT_STORAGE_PKCE_VERIFIER_KEY);
	}

	setToken(token: SpotifyToken): void {
		localStorage.setItem(DEFAULT_STORAGE_TOKEN_KEY, JSON.stringify(token));
	}

	setPKCEVerifier(pkceVerifier: string): void {
		localStorage.setItem(DEFAULT_STORAGE_PKCE_VERIFIER_KEY, pkceVerifier);
	}

	removeToken(): void {
		localStorage.removeItem(DEFAULT_STORAGE_TOKEN_KEY);
	}

	removePKCEVerifier(): void {
		localStorage.removeItem(DEFAULT_STORAGE_PKCE_VERIFIER_KEY);
	}
}
