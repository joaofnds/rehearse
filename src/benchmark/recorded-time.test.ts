import { describe, expect, it } from "bun:test";

import {
	newestFirst,
	oldestFirst,
	startTime,
	startedAtSchema,
} from "./recorded-time";

describe(newestFirst.name, () => {
	it("orders records that say when they ran newest first, then the rest as given", () => {
		const records = [
			{ id: "untimed-1", time: undefined },
			{ id: "run", time: "2026-10-01T10-30-00.000Z" },
			{ id: "unnamed", time: "any-name-1" },
			{ id: "group", time: "2026-10-01T10:15:00.000Z" },
			{ id: "attempt", time: "2026-10-01T10:45:00.000Z" },
		];

		const ordered = newestFirst(records, ({ time }) => time);

		expect(ordered.map(({ id }) => id)).toEqual([
			"attempt",
			"run",
			"group",
			"untimed-1",
			"unnamed",
		]);
	});
});

describe(oldestFirst.name, () => {
	it("orders records that say when they ran oldest first, then the rest as given", () => {
		const records = [
			{ id: "untimed-1", time: undefined },
			{ id: "run", time: "2026-10-01T10-30-00.000Z" },
			{ id: "unnamed", time: "any-name-1" },
			{ id: "group", time: "2026-10-01T10:15:00.000Z" },
		];

		const ordered = oldestFirst(records, ({ time }) => time);

		expect(ordered.map(({ id }) => id)).toEqual([
			"group",
			"run",
			"untimed-1",
			"unnamed",
		]);
	});
});

describe("the start time a record keeps", () => {
	it("accepts the instant a writer records", () => {
		const RECORDED_EPOCH_MS = 1_791_454_500_000;
		const time = startTime(() => RECORDED_EPOCH_MS);

		expect(startedAtSchema.parse(time)).toBe("2026-10-08T10:15:00.000Z");
	});

	it.each(["2026-10-08T10:15Z", "2026-02-30T10:15:00.000Z", "not a time"])(
		"refuses %p, which no reader could place",
		(time) => {
			expect(startedAtSchema.safeParse(time).success).toBeFalse();
		},
	);
});
