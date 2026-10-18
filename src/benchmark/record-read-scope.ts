import { AsyncLocalStorage } from "node:async_hooks";

const scope = new AsyncLocalStorage<object>();

/** A reader's typed cache belongs to the current report and is released with it. */
export function scopedRecordReader<Value>(
	read: (path: string) => Promise<Value>,
): (path: string) => Promise<Value> {
	const caches = new WeakMap<object, Map<string, Promise<Value>>>();

	return (path) => {
		const current = scope.getStore();
		if (current === undefined) {
			return read(path);
		}

		let cache = caches.get(current);
		if (cache === undefined) {
			cache = new Map();
			caches.set(current, cache);
		}
		let pending = cache.get(path);
		if (pending === undefined) {
			pending = read(path);
			cache.set(path, pending);
		}

		return pending;
	};
}

export function withRecordReadScope<Value>(
	read: () => Promise<Value>,
): Promise<Value> {
	return scope.getStore() === undefined ? scope.run({}, read) : read();
}

export const recordFileExists = scopedRecordReader((path) =>
	Bun.file(path).exists(),
);
export const recordFileText = scopedRecordReader((path) =>
	Bun.file(path).text(),
);
export const recordFileJson = scopedRecordReader(
	// oxlint-disable-next-line anti-slop/no-unknown-returns -- callers immediately validate their own record schema
	async (path): Promise<unknown> => {
		const value: unknown = JSON.parse(await recordFileText(path));
		return value;
	},
);
