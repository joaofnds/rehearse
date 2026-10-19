import { describe, expect, it } from "bun:test";

import ReliabilitySummaryBuilder from "#server/comparison-quality-test-fixture";

import qualityReading from "./comparison-quality-reading";

const GRADE_COUNT_ONE = 1;
const GRADE_COUNT_THREE = 3;
const GRADE_COUNT_FOUR = 4;
const GRADE_COUNT_EIGHT = 8;

function verifyQualityReadingNameReadsTheFinalRowSPassRateInsteadOfTheFiveLetterScale(): void {
	const minuend = new ReliabilitySummaryBuilder({
		gradeDistribution: Object.fromEntries([
			["PASS", GRADE_COUNT_THREE],
			["FAIL", GRADE_COUNT_ONE],
		]),
		name: "final",
		requested: 4,
		successful: 3,
	}).build();
	const subtrahend = new ReliabilitySummaryBuilder({
		gradeDistribution: Object.fromEntries([
			["PASS", GRADE_COUNT_ONE],
			["FAIL", GRADE_COUNT_THREE],
		]),
		name: "final",
		requested: 4,
		successful: 1,
	}).build();

	const reading = qualityReading({
		minuend,
		minuendArm: "candidate",
		scale: "successRate",
		subtrahend,
		subtrahendArm: "baseline",
	});

	expect(reading).toEqual({
		interval: {
			minuend: { high: "95%", low: "30%" },
			subtrahend: { high: "70%", low: "5%" },
		},
		verdict: { kind: "insideRerunNoise" },
	});
}

function verifyQualityReadingNameNamesTheHigherSucceedingArmOnTheFinalRowSPassRateWhenTheIntervalsAreSeparated(): void {
	const minuend = new ReliabilitySummaryBuilder({
		gradeDistribution: Object.fromEntries([["PASS", GRADE_COUNT_EIGHT]]),
		name: "final",
		requested: 8,
		successful: 8,
	}).build();
	const subtrahend = new ReliabilitySummaryBuilder({
		gradeDistribution: Object.fromEntries([["FAIL", GRADE_COUNT_EIGHT]]),
		name: "final",
		requested: 8,
		successful: 0,
	}).build();

	const reading = qualityReading({
		minuend,
		minuendArm: "candidate",
		scale: "successRate",
		subtrahend,
		subtrahendArm: "baseline",
	});

	expect(reading.verdict).toEqual({ arm: "candidate", kind: "separated" });
}

function verifyQualityReadingNameReadsUnavailableWithNoIntervalForAnArmThatNeverReachedTheMeasure(): void {
	const minuend = new ReliabilitySummaryBuilder({
		gradeDistribution: Object.fromEntries([]),
		requested: 4,
		successful: 0,
	}).build();
	const subtrahend = new ReliabilitySummaryBuilder({
		gradeDistribution: Object.fromEntries([["A", GRADE_COUNT_FOUR]]),
		requested: 4,
		successful: 4,
	}).build();

	const reading = qualityReading({
		minuend,
		minuendArm: "candidate",
		scale: "letters",
		subtrahend,
		subtrahendArm: "baseline",
	});

	expect(reading).toEqual({
		interval: {
			minuend: undefined,
			subtrahend: { high: "A", low: "A" },
		},
		verdict: { kind: "unavailable" },
	});
}

function verifyQualityReadingNameReadsUnavailableWithNoIntervalOnEitherSideWhenNeitherArmEverReachedTheMeasure(): void {
	const minuend = new ReliabilitySummaryBuilder({
		gradeDistribution: Object.fromEntries([]),
		requested: 4,
		successful: 0,
	}).build();
	const subtrahend = new ReliabilitySummaryBuilder({
		gradeDistribution: Object.fromEntries([]),
		requested: 4,
		successful: 0,
	}).build();

	const reading = qualityReading({
		minuend,
		minuendArm: "candidate",
		scale: "letters",
		subtrahend,
		subtrahendArm: "baseline",
	});

	expect(reading).toEqual({
		interval: { minuend: undefined, subtrahend: undefined },
		verdict: { kind: "unavailable" },
	});
}

describe(qualityReading.name, () => {
	it(
		"reads the final row's pass rate instead of the five-letter scale",
		verifyQualityReadingNameReadsTheFinalRowSPassRateInsteadOfTheFiveLetterScale,
	);

	it(
		"names the higher-succeeding arm on the final row's pass rate when the intervals are separated",
		verifyQualityReadingNameNamesTheHigherSucceedingArmOnTheFinalRowSPassRateWhenTheIntervalsAreSeparated,
	);

	it(
		"reads unavailable with no interval for an arm that never reached the measure",
		verifyQualityReadingNameReadsUnavailableWithNoIntervalForAnArmThatNeverReachedTheMeasure,
	);

	it(
		"reads unavailable with no interval on either side when neither arm ever reached the measure",
		verifyQualityReadingNameReadsUnavailableWithNoIntervalOnEitherSideWhenNeitherArmEverReachedTheMeasure,
	);
});
