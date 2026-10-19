import { describe, expect, it } from "bun:test";

import {
	dimensionReading,
	firingsReading,
	meterReading,
} from "./comparison-what-moved";

const arms = { minuend: "candidate", subtrahend: "baseline" } as const;

describe(firingsReading.name, () => {
	it(
		"names the arm that fires less often when the firing intervals are separated",
		verifyFiringsReadingNameNamesTheArmThatFiresLessOftenWhenTheFiringIntervalsAreSeparated,
	);

	it(
		"reads unavailable, never inside rerun noise, with no interval for an arm no rep was graded on",
		verifyFiringsReadingNameReadsUnavailableNeverInsideRerunNoiseWithNoIntervalForAnArmNoRepWasGradedOn,
	);
});

describe(dimensionReading.name, () => {
	it(
		"reads each arm's letter span from the bottom of the scale to the top",
		verifyDimensionReadingNameReadsEachArmSLetterSpanFromTheBottomOfTheScaleToTheTop,
	);
});

describe(meterReading.name, () => {
	it(
		"names the arm that ran higher and the change when four attempts an arm do not overlap",
		verifyMeterReadingNameNamesTheArmThatRanHigherAndTheChangeWhenFourAttemptsAnArmDoNotOverlap,
	);

	it(
		"reads inside rerun noise when three attempts an arm do not overlap, since noise separates them one time in ten",
		verifyMeterReadingNameReadsInsideRerunNoiseWhenThreeAttemptsAnArmDoNotOverlapSinceNoiseSeparatesThemOneTimeInTen,
	);

	it(
		"reads unavailable with the reason an arm recorded nothing to measure",
		verifyMeterReadingNameReadsUnavailableWithTheReasonAnArmRecordedNothingToMeasure,
	);

	it(
		"reads unavailable with the reason the subtracted arm recorded nothing to measure",
		verifyMeterReadingNameReadsUnavailableWithTheReasonTheSubtractedArmRecordedNothingToMeasure,
	);

	it(
		"states a reason both arms share once",
		verifyMeterReadingNameStatesAReasonBothArmsShareOnce,
	);

	it(
		"reads no change against a subtrahend that averaged zero",
		verifyMeterReadingNameReadsNoChangeAgainstASubtrahendThatAveragedZero,
	);
});

function verifyFiringsReadingNameNamesTheArmThatFiresLessOftenWhenTheFiringIntervalsAreSeparated(): void {
	const reading = firingsReading(
		{ fired: 0, of: 12, state: "available" },
		{ fired: 11, of: 12, state: "available" },
		arms,
	);

	expect(reading.verdict).toEqual({ arm: "candidate", kind: "separated" });
}

function verifyFiringsReadingNameReadsUnavailableNeverInsideRerunNoiseWithNoIntervalForAnArmNoRepWasGradedOn(): void {
	const reading = firingsReading(
		{ reasons: ["no rep"], state: "unavailable" },
		{ fired: 1, of: 2, state: "available" },
		arms,
	);

	expect(reading).toEqual({
		interval: { minuend: undefined, subtrahend: { high: "91%", low: "9%" } },
		verdict: { kind: "unavailable" },
	});
}

function verifyDimensionReadingNameReadsEachArmSLetterSpanFromTheBottomOfTheScaleToTheTop(): void {
	const reading = dimensionReading(
		{ highest: "A", lowest: "C", median: "B", state: "available" },
		{ highest: "D", lowest: "F", median: "D", state: "available" },
		arms,
	);

	expect(reading.interval).toEqual({
		minuend: { high: "A", low: "C" },
		subtrahend: { high: "D", low: "F" },
	});
}

function verifyMeterReadingNameNamesTheArmThatRanHigherAndTheChangeWhenFourAttemptsAnArmDoNotOverlap(): void {
	const reading = meterReading(
		{ counted: 4, high: 150, low: 120, mean: 134, state: "available" },
		{ counted: 4, high: 110, low: 90, mean: 100, state: "available" },
		arms,
	);

	expect(reading).toEqual({
		change: "+34%",
		interval: {
			minuend: { high: 150, low: 120 },
			subtrahend: { high: 110, low: 90 },
		},
		verdict: { arm: "candidate", kind: "higher" },
	});
}

function verifyMeterReadingNameReadsInsideRerunNoiseWhenThreeAttemptsAnArmDoNotOverlapSinceNoiseSeparatesThemOneTimeInTen(): void {
	const reading = meterReading(
		{ counted: 3, high: 150, low: 120, mean: 134, state: "available" },
		{ counted: 3, high: 110, low: 90, mean: 100, state: "available" },
		arms,
	);

	expect(reading.verdict).toEqual({ kind: "insideRerunNoise" });
}

function verifyMeterReadingNameReadsUnavailableWithTheReasonAnArmRecordedNothingToMeasure(): void {
	const reading = meterReading(
		{ reasons: ["no words"], state: "unavailable" },
		{ counted: 4, high: 110, low: 90, mean: 100, state: "available" },
		arms,
	);

	expect(reading.verdict).toEqual({
		kind: "unavailable",
		reasons: ["no words"],
	});
}

function verifyMeterReadingNameReadsUnavailableWithTheReasonTheSubtractedArmRecordedNothingToMeasure(): void {
	const reading = meterReading(
		{ counted: 4, high: 110, low: 90, mean: 100, state: "available" },
		{ reasons: ["no words"], state: "unavailable" },
		arms,
	);

	expect(reading.verdict).toEqual({
		kind: "unavailable",
		reasons: ["no words"],
	});
}

function verifyMeterReadingNameStatesAReasonBothArmsShareOnce(): void {
	const reading = meterReading(
		{ reasons: ["no words"], state: "unavailable" },
		{ reasons: ["no words"], state: "unavailable" },
		arms,
	);

	expect(reading.verdict).toEqual({
		kind: "unavailable",
		reasons: ["no words"],
	});
}

function verifyMeterReadingNameReadsNoChangeAgainstASubtrahendThatAveragedZero(): void {
	const reading = meterReading(
		{ counted: 1, high: 1, low: 1, mean: 1, state: "available" },
		{ counted: 1, high: 0, low: 0, mean: 0, state: "available" },
		arms,
	);

	expect(reading.change).toBeUndefined();
}
