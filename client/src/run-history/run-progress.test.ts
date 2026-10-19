import { describe, expect, it } from "bun:test";

import {
	clockReading,
	elapsedReading,
	liveElapsedMs,
	spendReading,
} from "./run-progress";

describe(elapsedReading.name, () => {
	it.each([
		{ elapsedMs: 0, expected: "0s" },
		{ elapsedMs: 9000, expected: "9s" },
		{ elapsedMs: 59_999, expected: "59s" },
		{ elapsedMs: 60_000, expected: "1m" },
		{ elapsedMs: 3_599_000, expected: "59m" },
		{ elapsedMs: 3_600_000, expected: "1h 0m" },
		{ elapsedMs: 7_830_000, expected: "2h 10m" },
	])(
		"reads $elapsedMs milliseconds as $expected",
		({ elapsedMs, expected }) => {
			expect(elapsedReading(elapsedMs)).toBe(expected);
		},
	);
});

describe(spendReading.name, () => {
	it.each([
		{ expected: "$0.00", spentUsd: 0 },
		{ expected: "$0.90", spentUsd: 0.9 },
		{ expected: "$12.35", spentUsd: 12.3456 },
	])("reads $spentUsd dollars as $expected", ({ spentUsd, expected }) => {
		expect(spendReading(spentUsd)).toBe(expected);
	});

	/**
	 * A figure exactly on the half-cent lands wherever the nearest double sits,
	 * so 1.005 reads as $1.00 rather than $1.01. Pinned rather than corrected:
	 * a half-cent does not change what an operator does about a spend, and the
	 * arbitrary-precision arithmetic that would fix it is not worth carrying.
	 */
	it(
		"rounds a half-cent figure by the nearest double rather than away from zero",
		roundsAHalfCentFigureByTheNearestDoubleRatherThanAwayFromZero,
	);
});

describe(liveElapsedMs.name, () => {
	/**
	 * A run reports its elapsed time only when it emits an event, once per agent
	 * turn. Carrying the recorded figure forward by the time since it was taken
	 * keeps the reading moving without inventing one the run never measured.
	 */
	it(
		"carries a recorded reading forward by the time since it was measured",
		carriesARecordedReadingForwardByTheTimeSinceItWasMeasured,
	);

	it(
		"keeps the recorded reading when no time has passed",
		keepsTheRecordedReadingWhenNoTimeHasPassed,
	);

	/**
	 * A clock behind the run's own, or a reading from a machine whose time
	 * differs, would otherwise run the figure backwards past what the run
	 * actually measured.
	 */
	it(
		"never reports less than the run itself recorded",
		neverReportsLessThanTheRunItselfRecorded,
	);

	it(
		"keeps the recorded reading when the measurement time is unreadable",
		keepsTheRecordedReadingWhenTheMeasurementTimeIsUnreadable,
	);
});

describe(clockReading.name, () => {
	it.each([
		{ elapsedMs: 0, expected: "00:00" },
		{ elapsedMs: 9999, expected: "00:09" },
		{ elapsedMs: 372_000, expected: "06:12" },
		{ elapsedMs: 3_723_000, expected: "1:02:03" },
	] as const)("reads $elapsedMs ms as $expected", ({ elapsedMs, expected }) => {
		expect(clockReading(elapsedMs)).toBe(expected);
	});
});

function roundsAHalfCentFigureByTheNearestDoubleRatherThanAwayFromZero(): void {
	const measurement = { expected: "$1.00", spentUsd: 1.005 };
	expect(spendReading(measurement.spentUsd)).toBe(measurement.expected);
}

function carriesARecordedReadingForwardByTheTimeSinceItWasMeasured(): void {
	const MEASUREMENT_ELAPSED_MS = 9000;
	const MEASUREMENT_EXPECTED_MS = 39_000;
	const measuredAt = new Date("2026-09-17T12:00:00.000Z");
	const now = new Date("2026-09-17T12:00:30.000Z");

	expect(
		liveElapsedMs(
			MEASUREMENT_ELAPSED_MS,
			measuredAt.toISOString(),
			now.getTime(),
		),
	).toBe(MEASUREMENT_EXPECTED_MS);
}

function keepsTheRecordedReadingWhenNoTimeHasPassed(): void {
	const MEASUREMENT_ELAPSED_MS = 9000;
	const MEASUREMENT_EXPECTED_MS = 9000;
	const measuredAt = new Date("2026-09-17T12:00:00.000Z");

	expect(
		liveElapsedMs(
			MEASUREMENT_ELAPSED_MS,
			measuredAt.toISOString(),
			measuredAt.getTime(),
		),
	).toBe(MEASUREMENT_EXPECTED_MS);
}

function neverReportsLessThanTheRunItselfRecorded(): void {
	const MEASUREMENT_ELAPSED_MS = 9000;
	const MEASUREMENT_EXPECTED_MS = 9000;
	const measuredAt = new Date("2026-09-17T12:00:00.000Z");
	const earlier = new Date("2026-09-17T11:59:00.000Z");

	expect(
		liveElapsedMs(
			MEASUREMENT_ELAPSED_MS,
			measuredAt.toISOString(),
			earlier.getTime(),
		),
	).toBe(MEASUREMENT_EXPECTED_MS);
}

function keepsTheRecordedReadingWhenTheMeasurementTimeIsUnreadable(): void {
	const MEASUREMENT_ELAPSED_MS = 9000;
	const MEASUREMENT_EXPECTED_MS = 9000;
	expect(liveElapsedMs(MEASUREMENT_ELAPSED_MS, "not a date", Date.now())).toBe(
		MEASUREMENT_EXPECTED_MS,
	);
}
