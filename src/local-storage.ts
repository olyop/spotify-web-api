import { StorageProvider } from "./types";

export class LocalStorageProvider implements StorageProvider {
	keys = {
		token: "spotify-web-api.token",
		pkceVerifier: "spotify-web-api.pkceverifier",
	};

	getItem(key: string) {
		return localStorage.getItem(key);
	}

	setItem(key: string, value: string) {
		localStorage.setItem(key, value);
	}

	removeItem(key: string) {
		localStorage.removeItem(key);
	}
}
