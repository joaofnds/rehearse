import { AsyncLocalStorage } from "node:async_hooks";

import type { z } from "zod";

const scope = new AsyncLocalStorage<object>();

function currentReadCache<Value>(
	caches: WeakMap<object, Map<string, Promise<Value>>>,
): Map<string, Promise<Value>> | undefined {
	const current = scope.getStore();
	if (current === undefined) {
		return undefined;
	}

	let cache = caches.get(current);
	if (cache === undefined) {
		cache = new Map();
		caches.set(current, cache);
	}
	return cache;
}

/** A reader's typed cache belongs to the current report and is released with it. */
function scopedRecordReader<Value>(
	read: (path: string) => Promise<Value>,
): (path: string) => Promise<Value> {
	const caches = new WeakMap<object, Map<string, Promise<Value>>>();

	return async (path) => {
		const cache = currentReadCache(caches);
		if (cache === undefined) {
			return await read(path);
		}

		let pending = cache.get(path);
		if (pending === undefined) {
			pending = read(path);
			cache.set(path, pending);
		}

		return await pending;
	};
}

async function withRecordReadScope<Value>(
	read: () => Promise<Value>,
): Promise<Value> {
	return await (scope.getStore() === undefined ? scope.run({}, read) : read());
}

const recordFileExists = scopedRecordReader(
	async (path) => await Bun.file(path).exists(),
);
const recordFileText = scopedRecordReader(
	async (path) => await Bun.file(path).text(),
);
/** Validate each report's file against the reader's own record contract. */
function scopedRecordParser<Value>(
	schema: z.ZodType<Value>,
): (path: string) => Promise<z.ZodSafeParseResult<Value>> {
	return scopedRecordReader(async (path) =>
		schema.safeParse(JSON.parse(await recordFileText(path))),
	);
}

export {
	scopedRecordReader,
	withRecordReadScope,
	recordFileExists,
	recordFileText,
	scopedRecordParser,
};
