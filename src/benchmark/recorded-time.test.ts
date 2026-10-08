import { describe, expect, it } from "bun:test";
import {
	newestFirst,
	oldestFirst,
	recordedInstant,
	startedAtSchema,
	startTime,
} from "./recorded-time";

describe(recordedInstant.name, () => {
	it.each([
		{ form: "a run name", time: "2026-10-01T10-30-00.000Z" },
		{ form: "a start time", time: "2026-10-01T10:30:00.000Z" },
	])("reads $form as the instant it names", ({ time }) => {
		expect(recordedInstant(time)).toBe(Date.UTC(2026, 9, 1, 10, 30));
	});

	it("places a run name after a start time earlier in the same hour", () => {
		const run = recordedInstant("2026-10-01T10-30-00.000Z") ?? Number.NaN;
		const group = recordedInstant("2026-10-01T10:15:00.000Z") ?? Number.NaN;

		expect(run).toBeGreaterThan(group);
	});

	it.each([
		"any-name-1",
		"2026-10-01",
		"2026-13-01T10-30-00.000Z",
		"2026-02-30T10-30-00.000Z",
		"2026-10-01T24:00:00.000Z",
		"2026-10-01T10:30:60.000Z",
	])("reads %p as no instant", (time) => {
		expect(recordedInstant(time)).toBeUndefined();
	});
});

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
		const time = startTime(() => Date.UTC(2026, 9, 8, 10, 15));

		expect(startedAtSchema.parse(time)).toBe("2026-10-08T10:15:00.000Z");
	});

	it.each(["2026-10-08T10:15Z", "2026-02-30T10:15:00.000Z", "not a time"])(
		"refuses %p, which no reader could place",
		(time) => {
			expect(startedAtSchema.safeParse(time).success).toBeFalse();
		},
	);
});
