import { AsyncLocalStorage } from "node:async_hooks";

import { z } from "zod";

import type { Immutable } from "./contracts";

const DEFAULT_CACHE_BYTES = 67_108_864;

const EMPTY_COLLECTION_LENGTH = 0;

const INITIAL_PARSER_ID = 0;

const EMPTY_CACHE_BYTES = 0;

const MAX_CACHE_ENTRIES = 2048;

interface ParsedRecord {
	readonly bytes: number;
	readonly evict: () => void;
}

function freezeRecord<Value>(
	value: Value,
): asserts value is Value & Immutable<Value> {
	const pending: unknown[] = [value];
	const visited = new Set<unknown>();
	while (pending.length > EMPTY_COLLECTION_LENGTH) {
		const current = pending.pop();
		if (
			current !== null &&
			current !== undefined &&
			!visited.has(current) &&
			(current instanceof Object || Object.getPrototypeOf(current) === null)
		) {
			visited.add(current);
			for (const child of Object.values(Object.freeze(current))) {
				pending.push(child);
			}
		}
	}
}

function parseImmutable<Value>(
	schema: z.ZodType<Value> & z.ZodType<Immutable<Value>>,
	text: string,
): Value & Immutable<Value> {
	const value = schema.parse(JSON.parse(text));

	freezeRecord(value);

	return value;
}

interface ParsedRecordValues<Value> {
	readonly get: (key: string) => { readonly value: Value } | undefined;
	readonly set: (key: string, value: { readonly value: Value }) => void;
	readonly delete: (key: string) => void;
}

interface ParserCache<Value> {
	readonly parserId: number;
	readonly values: ParsedRecordValues<Value>;
}

interface ParsedRecordWrite<Value> {
	readonly key: string;
	readonly text: string;
	readonly value: Value & Immutable<Value>;
	readonly values: ParsedRecordValues<Value & Immutable<Value>>;
}

/** Reuse validated bytes, never a path or a freshness judgment. */
class RecordParseCache {
	private readonly entries = new Map<string, ParsedRecord>();
	private readonly parsers = z.registry<ParserCache<z.$output>>();
	private nextParser = INITIAL_PARSER_ID;
	private bytes = EMPTY_CACHE_BYTES;

	public constructor(private readonly maximumBytes = DEFAULT_CACHE_BYTES) {}

	// Keep the schema's output and its deeply readonly view associated in the registry.
	public parse<Value>(
		schema: z.ZodType<Value> & z.ZodType<Immutable<Value>>,
		text: string,
	): Immutable<Value> {
		const parser = this.parserFor<Value>(schema);
		const key = `${String(parser.parserId)}:${new Bun.CryptoHasher("sha256").update(text).digest("hex")}`;
		const cached = parser.values.get(key);
		if (cached !== undefined && this.promote(key)) {
			return cached.value;
		}

		const value = parseImmutable<Value>(schema, text);

		this.remember<Value>({ key, text, value, values: parser.values });

		return value;
	}
	private parserFor<Value>(
		schema: z.ZodType<Value> & z.ZodType<Immutable<Value>>,
	): ParserCache<Value & Immutable<Value>> {
		// Registry metadata normally inherits across schema clones; cache ownership does not.
		let parser = this.parsers.has(schema)
			? this.parsers.get(schema)
			: undefined;
		if (parser === undefined) {
			parser = { parserId: this.nextParser, values: new Map() };
			this.nextParser += 1;
			this.parsers.add(schema, parser);
		}

		return parser;
	}
	private promote(key: string): boolean {
		const entry = this.entries.get(key);
		if (entry === undefined) {
			return false;
		}

		this.entries.delete(key);
		this.entries.set(key, entry);

		return true;
	}
	private remember<Value>({
		key,
		text,
		value,
		values,
	}: ParsedRecordWrite<Value>): void {
		const bytes = Buffer.byteLength(text);
		if (bytes <= this.maximumBytes) {
			values.set(key, { value });
			this.entries.set(key, {
				bytes,
				evict: () => {
					values.delete(key);
				},
			});
			this.bytes += bytes;
			this.evictOverBudget();
		}
	}
	private evictOverBudget(): void {
		while (
			this.bytes > this.maximumBytes ||
			this.entries.size > MAX_CACHE_ENTRIES
		) {
			const oldest = this.entries.entries().next().value;
			if (oldest === undefined) {
				break;
			}

			const [cacheKey, entry] = oldest;

			this.entries.delete(cacheKey);
			this.bytes -= entry.bytes;
			entry.evict();
		}
	}
}

const cache = new AsyncLocalStorage<
	Readonly<Pick<RecordParseCache, "parse">>
>();

async function withRecordParseCache<Value>(
	owner: Readonly<Pick<RecordParseCache, "parse">>,
	read: () => Promise<Value>,
): Promise<Value> {
	return await cache.run(owner, read);
}

function parseRecord<Value>(
	schema: z.ZodType<Value> & z.ZodType<Immutable<Value>>,
	text: string,
): Immutable<Value> {
	const owner = cache.getStore();
	return owner === undefined
		? parseImmutable<Value>(schema, text)
		: owner.parse<Value>(schema, text);
}

export { RecordParseCache, withRecordParseCache, parseRecord };
