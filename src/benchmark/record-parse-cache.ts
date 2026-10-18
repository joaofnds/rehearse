import type { z } from "zod";
import type { Immutable } from "./contracts";
import { AsyncLocalStorage } from "node:async_hooks";

interface ParsedRecord {
	readonly value: unknown;
	readonly bytes: number;
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- recursively visit a schema-validated JSON tree, not an input boundary
function freezeRecord(value: unknown): void {
	// oxlint-disable-next-line anti-slop/no-runtime-typeof -- traverse an already validated JSON tree to freeze its objects
	if (value === null || typeof value !== "object") {
		return;
	}

	for (const child of Object.values(value)) {
		freezeRecord(child);
	}
	Object.freeze(value);
}

function parseImmutable<Value>(
	schema: z.ZodType<Value>,
	text: string,
): Immutable<Value> {
	const value = schema.parse(JSON.parse(text));
	freezeRecord(value);
	// SAFETY: freezeRecord recursively freezes the parsed JSON tree.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- runtime freezing supplies the immutable contract
	return value as Immutable<Value>;
}

/** Reuse validated bytes, never a path or a freshness judgment. */
export class RecordParseCache {
	private readonly entries = new Map<string, ParsedRecord>();
	private readonly parsers = new WeakMap<object, number>();
	private nextParser = 0;
	private bytes = 0;

	public constructor(private readonly maximumBytes = 64 * 1024 * 1024) {}

	public parse<Value>(
		schema: z.ZodType<Value>,
		text: string,
	): Immutable<Value> {
		let parser = this.parsers.get(schema);
		if (parser === undefined) {
			parser = this.nextParser;
			this.nextParser += 1;
			this.parsers.set(schema, parser);
		}
		const key = `${String(parser)}:${new Bun.CryptoHasher("sha256").update(text).digest("hex")}`;
		const cached = this.entries.get(key);
		if (cached !== undefined) {
			this.entries.delete(key);
			this.entries.set(key, cached);
			// SAFETY: the key identifies this exact parser and the SHA-256 of its input bytes.
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- schema identity preserves the cached output type
			return cached.value as Immutable<Value>;
		}

		const value = parseImmutable(schema, text);
		const bytes = Buffer.byteLength(text);
		if (bytes <= this.maximumBytes) {
			this.entries.set(key, { value, bytes });
			this.bytes += bytes;
			while (this.bytes > this.maximumBytes || this.entries.size > 2048) {
				const oldest = this.entries.entries().next().value;
				if (oldest === undefined) {
					break;
				}
				this.entries.delete(oldest[0]);
				this.bytes -= oldest[1].bytes;
			}
		}

		return value;
	}
}

const cache = new AsyncLocalStorage<
	Readonly<Pick<RecordParseCache, "parse">>
>();

export function withRecordParseCache<Value>(
	owner: Readonly<Pick<RecordParseCache, "parse">>,
	read: () => Promise<Value>,
): Promise<Value> {
	return cache.run(owner, read);
}

export function parseRecord<Value>(
	schema: z.ZodType<Value>,
	text: string,
): Immutable<Value> {
	const owner = cache.getStore();
	return owner === undefined
		? parseImmutable(schema, text)
		: owner.parse(schema, text);
}
