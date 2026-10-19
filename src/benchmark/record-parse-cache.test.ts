import { describe, expect, it } from "bun:test";

import { z } from "zod";

import {
	RecordParseCache,
	parseRecord,
	withRecordParseCache,
} from "./record-parse-cache";

const RECORD_PARSE_COUNT_INCREMENT = 1;

const recordSchema = z.object({ value: z.string() });
const first = JSON.stringify({ value: "first" });
const second = JSON.stringify({ value: "second" });
const nestedRecordSchema = z.object({ rows: z.array(recordSchema) }).readonly();
const nestedEvidenceText = JSON.stringify({ rows: [{ value: "saved" }] });

const RecordParseCacheReusesOnlyTheSameParserAndTheSameInputBytes =
	(): void => {
		const cache = new RecordParseCache();
		const original = cache.parse(recordSchema, first);
		const different = z.object({
			value: z.string().transform((value) => value.toUpperCase()),
		});

		expect(cache.parse(recordSchema, first)).toBe(original);
		expect(cache.parse(recordSchema, second)).toEqual({ value: "second" });
		expect(cache.parse(different, first)).toEqual({ value: "FIRST" });
	};

const RecordParseCacheReturnsACachedValueWithoutParsingItsSchemaAgain =
	(): void => {
		const expectedParses = 1;

		const cache = new RecordParseCache();
		let parses = 0;
		const schema = recordSchema.transform((record) => {
			parses += RECORD_PARSE_COUNT_INCREMENT;
			return record;
		});
		const original = cache.parse(schema, first);

		const repeated = cache.parse(schema, first);

		expect(repeated).toBe(original);
		expect(parses).toBe(expectedParses);
	};

const RecordParseCacheKeepsAClonedSchemasCacheSeparateFromItsParentsCache =
	(): void => {
		const cache = new RecordParseCache();
		const clone = recordSchema.clone();
		const original = cache.parse(recordSchema, first);

		const cloned = cache.parse(clone, first);

		expect(cloned).not.toBe(original);
		expect(cache.parse(clone, first)).toBe(cloned);
	};

const RecordParseCacheReusesACachedSchemaOutputThatIsUndefined = (): void => {
	const expectedParses = 1;

	const cache = new RecordParseCache();
	let parses = 0;
	const schema = recordSchema.transform((): undefined => {
		parses += RECORD_PARSE_COUNT_INCREMENT;
		return undefined;
	});
	cache.parse(schema, first);

	cache.parse(schema, first);

	expect(parses).toBe(expectedParses);
};

const RecordParseCacheProtectsCachedEvidenceFromMutationsThroughNestedAliases =
	(): void => {
		const cache = new RecordParseCache();
		const record = cache.parse(nestedRecordSchema, nestedEvidenceText);
		const [nested] = record.rows;
		if (nested === undefined) {
			throw new Error("No parsed row");
		}

		expect(Reflect.set(nested, "value", "changed")).toBe(false);
		expect(Reflect.set(record.rows, "0", { value: "replaced" })).toBe(false);
		expect(Reflect.set(record, "rows", [])).toBe(false);
		expect(cache.parse(nestedRecordSchema, nestedEvidenceText)).toEqual({
			rows: [{ value: "saved" }],
		});
	};

const RecordParseCacheFreezesSchemaOutputsWithANullPrototype = (): void => {
	const cache = new RecordParseCache();
	const schema = recordSchema.transform((record) => {
		Object.setPrototypeOf(record, null);
		return record;
	});

	const record = cache.parse(schema, first);

	expect(Object.getPrototypeOf(record)).toBeNull();
	expect(Reflect.set(record, "value", "changed")).toBe(false);
};

const RecordParseCacheFreezesRecordsCarryingLongText = (): void => {
	const cache = new RecordParseCache();
	const EVIDENCE_REPETITIONS = 25_000;
	const value = "evidence".repeat(EVIDENCE_REPETITIONS);

	const record = cache.parse(recordSchema, JSON.stringify({ value }));

	expect(record).toEqual({ value });
	expect(Reflect.set(record, "value", "changed")).toBe(false);
};

const RecordParseCacheEvictsTheLeastRecentlyReadInputAtItsByteLimit =
	(): void => {
		const cache = new RecordParseCache(
			Buffer.byteLength(first) + Buffer.byteLength(second),
		);
		const original = cache.parse(recordSchema, first);
		const older = cache.parse(recordSchema, second);
		cache.parse(recordSchema, first);
		cache.parse(recordSchema, JSON.stringify({ value: "third" }));

		expect(cache.parse(recordSchema, first)).toBe(original);
		expect(cache.parse(recordSchema, second)).not.toBe(older);
	};

const RecordParseCacheSharesOneEvictionBudgetAcrossDistinctSchemas =
	(): void => {
		const cache = new RecordParseCache(
			Buffer.byteLength(first) + Buffer.byteLength(second),
		);
		const different = recordSchema.clone();
		const original = cache.parse(recordSchema, first);
		const older = cache.parse(different, second);
		cache.parse(recordSchema, first);

		cache.parse(recordSchema, JSON.stringify({ value: "third" }));

		expect(cache.parse(recordSchema, first)).toBe(original);
		expect(cache.parse(different, second)).not.toBe(older);
	};

const RecordParseCacheEvictsTheOldestInputWhenItsEntryLimitIsExceeded =
	(): void => {
		const cache = new RecordParseCache();
		const original = cache.parse(recordSchema, first);
		const inputs = Array.from({ length: 2048 }, (_value, index) =>
			JSON.stringify({ value: String(index) }),
		);

		for (const input of inputs) {
			cache.parse(recordSchema, input);
		}

		expect(cache.parse(recordSchema, first)).not.toBe(original);
	};

const RecordParseCacheLeavesOversizedInputsUncached = (): void => {
	const CACHE_BYTE_BUDGET = 1;
	const cache = new RecordParseCache(CACHE_BYTE_BUDGET);
	const original = cache.parse(recordSchema, first);

	expect(cache.parse(recordSchema, first)).not.toBe(original);
};

const RecordParseCacheRefusesInvalidEvidenceWithoutAffectingALaterValidRead =
	(): void => {
		const cache = new RecordParseCache();

		expect(() => cache.parse(recordSchema, '{"value":3}')).toThrow(z.ZodError);
		expect(cache.parse(recordSchema, first)).toEqual({ value: "first" });
	};

describe("record parser identity and eviction", () => {
	it(
		"reuses only the same parser and the same input bytes",
		RecordParseCacheReusesOnlyTheSameParserAndTheSameInputBytes,
	);
	it(
		"returns a cached value without parsing its schema again",
		RecordParseCacheReturnsACachedValueWithoutParsingItsSchemaAgain,
	);
	it(
		"keeps a cloned schema's cache separate from its parent's cache",
		RecordParseCacheKeepsAClonedSchemasCacheSeparateFromItsParentsCache,
	);
	it(
		"reuses a cached schema output that is undefined",
		RecordParseCacheReusesACachedSchemaOutputThatIsUndefined,
	);
	it(
		"evicts the least recently read input at its byte limit",
		RecordParseCacheEvictsTheLeastRecentlyReadInputAtItsByteLimit,
	);
	it(
		"shares one eviction budget across distinct schemas",
		RecordParseCacheSharesOneEvictionBudgetAcrossDistinctSchemas,
	);
	it(
		"evicts the oldest input when its entry limit is exceeded",
		RecordParseCacheEvictsTheOldestInputWhenItsEntryLimitIsExceeded,
	);
	it(
		"leaves oversized inputs uncached",
		RecordParseCacheLeavesOversizedInputsUncached,
	);
	it(
		"refuses invalid evidence without affecting a later valid read",
		RecordParseCacheRefusesInvalidEvidenceWithoutAffectingALaterValidRead,
	);
});
describe("cached evidence immutability", () => {
	it(
		"protects cached evidence from mutations through nested aliases",
		RecordParseCacheProtectsCachedEvidenceFromMutationsThroughNestedAliases,
	);
	it(
		"freezes schema outputs with a null prototype",
		RecordParseCacheFreezesSchemaOutputsWithANullPrototype,
	);
	it(
		"freezes records carrying long text",
		RecordParseCacheFreezesRecordsCarryingLongText,
	);
});

const withRecordParseCacheKeepsCachesOwnedByDifferentServersIndependent =
	async (): Promise<void> => {
		const left = new RecordParseCache();
		const right = new RecordParseCache();

		const original = await withRecordParseCache(
			left,
			async () => await Promise.resolve(parseRecord(recordSchema, first)),
		);

		expect(
			await withRecordParseCache(
				left,
				async () => await Promise.resolve(parseRecord(recordSchema, first)),
			),
		).toBe(original);
		expect(
			await withRecordParseCache(
				right,
				async () => await Promise.resolve(parseRecord(recordSchema, first)),
			),
		).not.toBe(original);
		expect(parseRecord(recordSchema, first)).not.toBe(original);
	};

describe(withRecordParseCache.name, () => {
	it(
		"keeps caches owned by different servers independent",
		withRecordParseCacheKeepsCachesOwnedByDifferentServersIndependent,
	);
});
