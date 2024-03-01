import { LOCAL_STORAGE_PKCE_VERIFIER_KEY, PKCE_VERIFIER_POSSIBLE_CHARACTERS } from "./values";

export async function generatePKCEChallenge() {
	const codeVerifier = generateRandomString(128);

	const codeChallenge = base64encode(await sha256(codeVerifier));

	localStorage.setItem(LOCAL_STORAGE_PKCE_VERIFIER_KEY, codeVerifier);

	return codeChallenge;
}

export function deleteStoredPKCEVerifier() {
	localStorage.removeItem(LOCAL_STORAGE_PKCE_VERIFIER_KEY);
}

export function retrieveStoredPKCEVerifierAndDelete() {
	const codeVerifier = localStorage.getItem(LOCAL_STORAGE_PKCE_VERIFIER_KEY);

	deleteStoredPKCEVerifier();

	return codeVerifier;
}

export function generateRandomString(length: number) {
	return crypto
		.getRandomValues(new Uint32Array(length))
		.reduce(
			(accumulator, character) =>
				accumulator + PKCE_VERIFIER_POSSIBLE_CHARACTERS[character % PKCE_VERIFIER_POSSIBLE_CHARACTERS.length],
			"",
		);
}

export function sha256(plain: string) {
	const encoder = new TextEncoder();
	const data = encoder.encode(plain);
	return window.crypto.subtle.digest("SHA-256", data);
}

export function base64encode(value: ArrayBuffer) {
	const valueString = String.fromCodePoint(...new Uint8Array(value));
	return btoa(valueString).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
