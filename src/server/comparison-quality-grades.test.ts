import { describe, expect, it } from "bun:test";

import ReliabilitySummaryBuilder from "#server/comparison-quality-test-fixture";

import qualityReading from "./comparison-quality-reading";

const GRADE_COUNT_ONE = 1;
const GRADE_COUNT_TWO = 2;
const GRADE_COUNT_THREE = 3;
const GRADE_COUNT_FOUR = 4;

function verifyQualityReadingNameReadsALetterSpanFromTheBottomOfTheScaleToTheTop(): void {
	const minuend = new ReliabilitySummaryBuilder({
		gradeDistribution: Object.fromEntries([
			["A", GRADE_COUNT_ONE],
			["B", GRADE_COUNT_ONE],
			["C", GRADE_COUNT_ONE],
		]),
		requested: 3,
		successful: 2,
	}).build();
	const subtrahend = new ReliabilitySummaryBuilder({
		gradeDistribution: Object.fromEntries([["B", GRADE_COUNT_THREE]]),
		requested: 3,
		successful: 3,
	}).build();

	const reading = qualityReading({
		minuend,
		minuendArm: "candidate",
		scale: "letters",
		subtrahend,
		subtrahendArm: "baseline",
	});

	expect(reading.interval.minuend).toEqual({ high: "A", low: "C" });
}

function verifyQualityReadingNameReadsInsideRerunNoiseWhenADeclaredStageMeasureSGradeSpansOverlap(): void {
	const minuend = new ReliabilitySummaryBuilder({
		gradeDistribution: Object.fromEntries([
			["B", GRADE_COUNT_THREE],
			["C", GRADE_COUNT_ONE],
		]),
		requested: 4,
		successful: 3,
	}).build();
	const subtrahend = new ReliabilitySummaryBuilder({
		gradeDistribution: Object.fromEntries([
			["B", GRADE_COUNT_ONE],
			["C", GRADE_COUNT_THREE],
		]),
		requested: 4,
		successful: 1,
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
			minuend: { high: "B", low: "C" },
			subtrahend: { high: "B", low: "C" },
		},
		verdict: { kind: "insideRerunNoise" },
	});
}

function verifyQualityReadingNameReadsUnchangedAlreadyClearWhenBothArmsHaveEveryRepSuccessful(): void {
	const minuend = new ReliabilitySummaryBuilder({
		gradeDistribution: Object.fromEntries([["A", GRADE_COUNT_FOUR]]),
		requested: 4,
		successful: 4,
	}).build();
	const subtrahend = new ReliabilitySummaryBuilder({
		gradeDistribution: Object.fromEntries([
			["A", GRADE_COUNT_TWO],
			["B", GRADE_COUNT_TWO],
		]),
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

	expect(reading.verdict).toEqual({ kind: "unchangedAlreadyClear" });
}

function verifyQualityReadingNameNamesTheArmWithTheHigherSuccessfulOfRequestedCountWhenGradeSpansDoNotOverlapAndNeitherArmIsAtCeiling(): void {
	const minuend = new ReliabilitySummaryBuilder({
		gradeDistribution: Object.fromEntries([["A", GRADE_COUNT_FOUR]]),
		requested: 4,
		successful: 4,
	}).build();
	const subtrahend = new ReliabilitySummaryBuilder({
		gradeDistribution: Object.fromEntries([["D", GRADE_COUNT_FOUR]]),
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

	expect(reading.verdict).toEqual({ arm: "candidate", kind: "separated" });
}

function verifyQualityReadingNameReadsInsideRerunNoiseNotADirectionalVerdictWhenNeitherArmIsAtCeilingAndTheTwoArmsTieOnSuccessfulOfRequested(): void {
	const minuend = new ReliabilitySummaryBuilder({
		gradeDistribution: Object.fromEntries([["C", GRADE_COUNT_FOUR]]),
		requested: 4,
		successful: 0,
	}).build();
	const subtrahend = new ReliabilitySummaryBuilder({
		gradeDistribution: Object.fromEntries([["F", GRADE_COUNT_FOUR]]),
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

	expect(reading.verdict).toEqual({ kind: "insideRerunNoise" });
}

function verifyQualityReadingNameNamesTheSubtrahendArmWhenItSucceedsMoreOften(): void {
	const minuend = new ReliabilitySummaryBuilder({
		gradeDistribution: Object.fromEntries([["D", GRADE_COUNT_FOUR]]),
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

	expect(reading.verdict).toEqual({ arm: "baseline", kind: "separated" });
}

function verifyQualityReadingNameReadsTheBinomial0NEdgeAsInsideRerunNoiseWhenBothArmsFailEveryRepWithOverlappingGrades(): void {
	const minuend = new ReliabilitySummaryBuilder({
		gradeDistribution: Object.fromEntries([["F", GRADE_COUNT_FOUR]]),
		requested: 4,
		successful: 0,
	}).build();
	const subtrahend = new ReliabilitySummaryBuilder({
		gradeDistribution: Object.fromEntries([
			["D", GRADE_COUNT_TWO],
			["F", GRADE_COUNT_TWO],
		]),
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

	expect(reading.verdict).toEqual({ kind: "insideRerunNoise" });
}

function verifyQualityReadingNameReadsTheBinomialNNEdgeAsUnchangedAlreadyClearWhenBothArmsSucceedEveryRep(): void {
	const minuend = new ReliabilitySummaryBuilder({
		gradeDistribution: Object.fromEntries([["A", GRADE_COUNT_FOUR]]),
		requested: 4,
		successful: 4,
	}).build();
	const subtrahend = new ReliabilitySummaryBuilder({
		gradeDistribution: Object.fromEntries([["B", GRADE_COUNT_FOUR]]),
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

	expect(reading.verdict).toEqual({ kind: "unchangedAlreadyClear" });
}

describe(qualityReading.name, () => {
	it(
		"reads a letter span from the bottom of the scale to the top",
		verifyQualityReadingNameReadsALetterSpanFromTheBottomOfTheScaleToTheTop,
	);

	it(
		"reads inside rerun noise when a declared-stage measure's grade spans overlap",
		verifyQualityReadingNameReadsInsideRerunNoiseWhenADeclaredStageMeasureSGradeSpansOverlap,
	);

	it(
		"reads unchanged already clear when both arms have every rep successful",
		verifyQualityReadingNameReadsUnchangedAlreadyClearWhenBothArmsHaveEveryRepSuccessful,
	);

	it(
		"names the arm with the higher successful-of-requested count when grade spans do not overlap and neither arm is at ceiling",
		verifyQualityReadingNameNamesTheArmWithTheHigherSuccessfulOfRequestedCountWhenGradeSpansDoNotOverlapAndNeitherArmIsAtCeiling,
	);

	it(
		"reads inside rerun noise, not a directional verdict, when neither arm is at ceiling and the two arms tie on successful-of-requested",
		verifyQualityReadingNameReadsInsideRerunNoiseNotADirectionalVerdictWhenNeitherArmIsAtCeilingAndTheTwoArmsTieOnSuccessfulOfRequested,
	);

	it(
		"names the subtrahend arm when it succeeds more often",
		verifyQualityReadingNameNamesTheSubtrahendArmWhenItSucceedsMoreOften,
	);

	it(
		"reads the binomial 0/n edge as inside rerun noise when both arms fail every rep with overlapping grades",
		verifyQualityReadingNameReadsTheBinomial0NEdgeAsInsideRerunNoiseWhenBothArmsFailEveryRepWithOverlappingGrades,
	);

	it(
		"reads the binomial n/n edge as unchanged already clear when both arms succeed every rep",
		verifyQualityReadingNameReadsTheBinomialNNEdgeAsUnchangedAlreadyClearWhenBothArmsSucceedEveryRep,
	);
});
