import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
	parseRecord,
	RecordParseCache,
	withRecordParseCache,
} from "./record-parse-cache";

const recordSchema = z.object({ value: z.string() });
const first = JSON.stringify({ value: "first" });
const second = JSON.stringify({ value: "second" });

describe(RecordParseCache.name, () => {
	it("reuses only the same parser and the same input bytes", () => {
		const cache = new RecordParseCache();
		const original = cache.parse(recordSchema, first);
		const different = z.object({
			value: z.string().transform((value) => value.toUpperCase()),
		});

		expect(cache.parse(recordSchema, first)).toBe(original);
		expect(cache.parse(recordSchema, second)).toEqual({ value: "second" });
		expect(cache.parse(different, first)).toEqual({ value: "FIRST" });
	});

	it("protects cached evidence from mutations through nested aliases", () => {
		const cache = new RecordParseCache();
		const schema = z.object({ rows: z.array(recordSchema) }).readonly();
		const text = JSON.stringify({ rows: [{ value: "saved" }] });
		const record = cache.parse(schema, text);
		const [nested] = record.rows;
		if (nested === undefined) {
			throw new Error("No parsed row");
		}

		expect(Reflect.set(nested, "value", "changed")).toBe(false);
		expect(Reflect.set(record.rows, "0", { value: "replaced" })).toBe(false);
		expect(Reflect.set(record, "rows", [])).toBe(false);
		expect(cache.parse(schema, text)).toEqual({ rows: [{ value: "saved" }] });
	});

	it("evicts the least recently read input at its byte limit", () => {
		const cache = new RecordParseCache(
			Buffer.byteLength(first) + Buffer.byteLength(second),
		);
		const original = cache.parse(recordSchema, first);
		const older = cache.parse(recordSchema, second);
		cache.parse(recordSchema, first);
		cache.parse(recordSchema, JSON.stringify({ value: "third" }));

		expect(cache.parse(recordSchema, first)).toBe(original);
		expect(cache.parse(recordSchema, second)).not.toBe(older);
	});

	it("leaves oversized inputs uncached", () => {
		const cache = new RecordParseCache(1);
		const original = cache.parse(recordSchema, first);

		expect(cache.parse(recordSchema, first)).not.toBe(original);
	});

	it("refuses invalid evidence without affecting a later valid read", () => {
		const cache = new RecordParseCache();

		expect(() => cache.parse(recordSchema, '{"value":3}')).toThrow(z.ZodError);
		expect(cache.parse(recordSchema, first)).toEqual({ value: "first" });
	});
});

describe(withRecordParseCache.name, () => {
	it("keeps caches owned by different servers independent", async () => {
		const left = new RecordParseCache();
		const right = new RecordParseCache();
		const original = await withRecordParseCache(left, () =>
			Promise.resolve(parseRecord(recordSchema, first)),
		);

		expect(
			await withRecordParseCache(left, () =>
				Promise.resolve(parseRecord(recordSchema, first)),
			),
		).toBe(original);
		expect(
			await withRecordParseCache(right, () =>
				Promise.resolve(parseRecord(recordSchema, first)),
			),
		).not.toBe(original);
		expect(parseRecord(recordSchema, first)).not.toBe(original);
	});
});
