import { describe, expect, it } from "bun:test";

import ReliabilitySummaryBuilder from "#server/comparison-quality-test-fixture";

import qualityReading from "./comparison-quality-reading";

function verifyQualityReadingNameOnASessionSPassRateNamesTheArmThatSucceedsMoreOftenWhenTheSuccessRateIntervalsAreSeparated(): void {
	const reading = qualityReading({
		minuend: new ReliabilitySummaryBuilder({
			name: "checks",
			requested: 12,
			successful: 11,
		}).build(),
		minuendArm: "candidate",
		scale: "successRate",
		subtrahend: new ReliabilitySummaryBuilder({
			name: "checks",
			requested: 12,
			successful: 1,
		}).build(),
		subtrahendArm: "baseline",
	});

	expect(reading.verdict).toEqual({ arm: "candidate", kind: "separated" });
}

function verifyQualityReadingNameOnASessionSPassRateReadsInsideRerunNoiseWhenTheSuccessRateIntervalsOverlap(): void {
	const reading = qualityReading({
		minuend: new ReliabilitySummaryBuilder({
			name: "checks",
			requested: 6,
			successful: 5,
		}).build(),
		minuendArm: "candidate",
		scale: "successRate",
		subtrahend: new ReliabilitySummaryBuilder({
			name: "checks",
			requested: 6,
			successful: 1,
		}).build(),
		subtrahendArm: "baseline",
	});

	expect(reading.verdict).toEqual({ kind: "insideRerunNoise" });
}

function verifyQualityReadingNameOnASessionSPassRateReportsEachArmS95SuccessRateInterval(): void {
	const reading = qualityReading({
		minuend: new ReliabilitySummaryBuilder({
			name: "checks",
			requested: 12,
			successful: 11,
		}).build(),
		minuendArm: "candidate",
		scale: "successRate",
		subtrahend: new ReliabilitySummaryBuilder({
			name: "checks",
			requested: 12,
			successful: 1,
		}).build(),
		subtrahendArm: "baseline",
	});

	expect(reading.interval).toEqual({
		minuend: { high: "99%", low: "65%" },
		subtrahend: { high: "35%", low: "1%" },
	});
}

function verifyQualityReadingNameOnASessionSPassRateCountsARepThatNeverReachedTheMeasureAsAFailedAttempt(): void {
	const reading = qualityReading({
		minuend: {
			...new ReliabilitySummaryBuilder({
				name: "checks",
				requested: 4,
				successful: 2,
			}).build(),
			attempted: 2,
			notReached: 2,
		},
		minuendArm: "candidate",
		scale: "successRate",
		subtrahend: new ReliabilitySummaryBuilder({
			name: "checks",
			requested: 4,
			successful: 0,
		}).build(),
		subtrahendArm: "baseline",
	});

	expect(reading.interval.minuend).toEqual({ high: "85%", low: "15%" });
}

describe(qualityReading.name, () => {
	describe("on a session's pass rate", () => {
		it(
			"names the arm that succeeds more often when the success-rate intervals are separated",
			verifyQualityReadingNameOnASessionSPassRateNamesTheArmThatSucceedsMoreOftenWhenTheSuccessRateIntervalsAreSeparated,
		);

		it(
			"reads inside rerun noise when the success-rate intervals overlap",
			verifyQualityReadingNameOnASessionSPassRateReadsInsideRerunNoiseWhenTheSuccessRateIntervalsOverlap,
		);

		it(
			"reports each arm's 95% success-rate interval",
			verifyQualityReadingNameOnASessionSPassRateReportsEachArmS95SuccessRateInterval,
		);

		it(
			"counts a rep that never reached the measure as a failed attempt",
			verifyQualityReadingNameOnASessionSPassRateCountsARepThatNeverReachedTheMeasureAsAFailedAttempt,
		);
	});
});
