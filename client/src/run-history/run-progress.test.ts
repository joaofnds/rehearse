import { describe, expect, it } from "bun:test";
import {
	clockReading,
	elapsedReading,
	liveElapsedMs,
	spendReading,
} from "./run-progress";

describe(elapsedReading.name, () => {
	it.each([
		[0, "0s"],
		[9000, "9s"],
		[59_999, "59s"],
		[60_000, "1m"],
		[3_599_000, "59m"],
		[3_600_000, "1h 0m"],
		[7_830_000, "2h 10m"],
	])("reads %i milliseconds as %s", (elapsedMs, expected) => {
		expect(elapsedReading(elapsedMs)).toBe(expected);
	});
});

describe(spendReading.name, () => {
	it.each([
		[0, "$0.00"],
		[0.9, "$0.90"],
		[12.3456, "$12.35"],
	])("reads %d dollars as %s", (spentUsd, expected) => {
		expect(spendReading(spentUsd)).toBe(expected);
	});

	/**
	 * A figure exactly on the half-cent lands wherever the nearest double sits,
	 * so 1.005 reads as $1.00 rather than $1.01. Pinned rather than corrected:
	 * a half-cent does not change what an operator does about a spend, and the
	 * arbitrary-precision arithmetic that would fix it is not worth carrying.
	 */
	it("rounds a half-cent figure by the nearest double rather than away from zero", () => {
		expect(spendReading(1.005)).toBe("$1.00");
	});
});

describe(liveElapsedMs.name, () => {
	/**
	 * A run reports its elapsed time only when it emits an event, once per agent
	 * turn. Carrying the recorded figure forward by the time since it was taken
	 * keeps the reading moving without inventing one the run never measured.
	 */
	it("carries a recorded reading forward by the time since it was measured", () => {
		const measuredAt = new Date("2026-09-17T12:00:00.000Z");
		const now = new Date("2026-09-17T12:00:30.000Z");

		expect(liveElapsedMs(9000, measuredAt.toISOString(), now.getTime())).toBe(
			39_000,
		);
	});

	it("keeps the recorded reading when no time has passed", () => {
		const measuredAt = new Date("2026-09-17T12:00:00.000Z");

		expect(
			liveElapsedMs(9000, measuredAt.toISOString(), measuredAt.getTime()),
		).toBe(9000);
	});

	/**
	 * A clock behind the run's own, or a reading from a machine whose time
	 * differs, would otherwise run the figure backwards past what the run
	 * actually measured.
	 */
	it("never reports less than the run itself recorded", () => {
		const measuredAt = new Date("2026-09-17T12:00:00.000Z");
		const earlier = new Date("2026-09-17T11:59:00.000Z");

		expect(
			liveElapsedMs(9000, measuredAt.toISOString(), earlier.getTime()),
		).toBe(9000);
	});

	it("keeps the recorded reading when the measurement time is unreadable", () => {
		expect(liveElapsedMs(9000, "not a date", Date.now())).toBe(9000);
	});
});

describe(clockReading.name, () => {
	it.each([
		[0, "00:00"],
		[9999, "00:09"],
		[372_000, "06:12"],
		[3_723_000, "1:02:03"],
	] as const)("reads %d ms as %s", (elapsedMs, reading) => {
		expect(clockReading(elapsedMs)).toBe(reading);
	});
});
