import { describe, expect, it } from "bun:test";
import { recordedInstant } from "./recorded-instant";

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
