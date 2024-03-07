/* eslint-disable unicorn/prevent-abbreviations */
import { CacheProvider } from "./types";

export class IndexedDbProvider implements CacheProvider {
	#database: IDBDatabase | null = null;
	#storeName: string;

	get isOpen() {
		return this.#database !== null;
	}

	constructor(databaseName: string, storeName: string, onReady?: () => void) {
		this.#storeName = storeName;

		void this.#initialize(databaseName, storeName, onReady);
	}

	async #initialize(databaseName: string, storeName: string, onReady?: () => void) {
		await navigator.storage.persist();

		const query = indexedDB.open(databaseName);

		query.addEventListener("error", () => {
			console.error(query.error);
		});

		query.addEventListener("upgradeneeded", () => {
			query.result.createObjectStore(storeName);
		});

		query.addEventListener("success", () => {
			this.#database = query.result;
			onReady?.();
		});
	}

	get(key: string) {
		return new Promise<string | null>(resolve => {
			if (this.#database === null) {
				resolve(null);
				return;
			}

			const transaction = this.#database.transaction(this.#storeName, "readonly");
			const store = transaction.objectStore(this.#storeName);

			const query = store.get(key);

			query.addEventListener("error", () => {
				resolve(null);
			});

			query.addEventListener("success", () => {
				resolve((query.result as unknown as string | undefined) ?? null);
			});
		});
	}

	async set(key: string, value: string) {
		await navigator.storage.persist();

		return new Promise<string | null>(resolve => {
			if (this.#database === null) {
				resolve(null);
				return;
			}

			const transaction = this.#database.transaction(this.#storeName, "readwrite");
			const store = transaction.objectStore(this.#storeName);

			store.put(value, key);

			transaction.addEventListener("complete", () => {
				resolve(value);
			});
		});
	}

	async remove(key: string) {
		return new Promise<string | null>(resolve => {
			if (this.#database === null) {
				resolve(null);
				return;
			}

			const transaction = this.#database.transaction(this.#storeName, "readwrite");
			const store = transaction.objectStore(this.#storeName);

			const query = store.delete(key);

			query.addEventListener("error", () => {
				resolve(null);
			});

			query.addEventListener("success", () => {
				resolve((query.result as unknown as string | undefined) ?? null);
			});
		});
	}

	clear() {
		return new Promise<void>(resolve => {
			if (this.#database === null) {
				resolve();
				return;
			}

			const transaction = this.#database.transaction(this.#storeName, "readwrite");
			const store = transaction.objectStore(this.#storeName);

			store.clear();

			transaction.addEventListener("error", () => {
				resolve();
			});

			transaction.addEventListener("complete", () => {
				resolve();
			});
		});
	}
}
