import { PKCE_VERIFIER_POSSIBLE_CHARACTERS, StorageProvider } from "./types";

export async function generatePKCEChallenge(storageProvider: StorageProvider) {
	const codeVerifier = generateRandomString(128);
	const codeChallenge = base64encode(await sha256(codeVerifier));

	storageProvider.setPKCEVerifier(codeVerifier);

	return codeChallenge;
}

export function retrievePKCEVerifier(storageProvider: StorageProvider) {
	const codeVerifier = storageProvider.getPKCEVerifier();

	storageProvider.removePKCEVerifier();

	return codeVerifier;
}

export function deletePKCEVerifier(storageProvider: StorageProvider) {
	storageProvider.removePKCEVerifier();
}

function generateRandomString(length: number) {
	return crypto
		.getRandomValues(new Uint32Array(length))
		.reduce(
			(accumulator, character) =>
				accumulator + PKCE_VERIFIER_POSSIBLE_CHARACTERS[character % PKCE_VERIFIER_POSSIBLE_CHARACTERS.length],
			"",
		);
}

function sha256(plain: string) {
	const encoder = new TextEncoder();
	const data = encoder.encode(plain);
	return window.crypto.subtle.digest("SHA-256", data);
}

function base64encode(value: ArrayBuffer) {
	const valueString = String.fromCodePoint(...new Uint8Array(value));
	return btoa(valueString).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
