import { describe, expect, it } from "bun:test";
import { setImmediate } from "node:timers/promises";
import { concurrentMap } from "./concurrent-map";

describe(concurrentMap.name, () => {
	it("preserves input order when a later reading finishes first", async () => {
		const first = Promise.withResolvers<number>();
		const second = Promise.resolve(2);
		const reading = concurrentMap([first.promise, second], (value) => value);
		await second;
		first.resolve(1);

		expect(await reading).toEqual([1, 2]);
	});

	it("bounds pending work while reading the whole collection", async () => {
		const gate = Promise.withResolvers<undefined>();
		let started = 0;
		const reading = concurrentMap(
			Array.from({ length: 40 }, (_value, index) => index),
			async (value) => {
				started += 1;
				await gate.promise;
				return value;
			},
		);

		expect(started).toBe(16);
		gate.resolve(undefined);
		expect(await reading).toEqual(
			Array.from({ length: 40 }, (_value, index) => index),
		);
	});

	it("answers an empty collection without reading anything", async () => {
		expect(await concurrentMap([], (value) => Promise.resolve(value))).toEqual(
			[],
		);
	});

	it("waits for pending readers before rejecting a failed collection", async () => {
		const gate = Promise.withResolvers<number>();
		const failure = new Error("unreadable record");
		const reading = concurrentMap(
			[Promise.reject(failure), gate.promise],
			(value) => value,
		);
		const settled = Promise.allSettled([reading]);

		const settledBeforeRelease = await Promise.race([
			settled,
			setImmediate(false),
		]);
		gate.resolve(2);

		expect(settledBeforeRelease).toBe(false);
		expect(await settled).toEqual([{ status: "rejected", reason: failure }]);
	});
});
