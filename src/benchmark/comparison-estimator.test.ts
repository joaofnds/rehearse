import { describe, expect, it } from "bun:test";

import {
	buildPairedEstimate,
	buildSingleCaseMeanEstimate,
	buildSingleCaseProportionEstimate,
} from "./comparison-estimator";

const SUCCESSFUL_OUTCOME_VALUE = 1;
const UNSUCCESSFUL_OUTCOME_VALUE = 0;

describe(buildPairedEstimate.name, () => {
	it(
		"averages within cases before estimating paired differences",
		averagesWithinCasesBeforeEstimatingPairedDifferences,
	);

	it(
		"ignores rep ordinal order within each case arm",
		ignoresRepOrdinalOrderWithinEachCaseArm,
	);
});

describe(buildSingleCaseProportionEstimate.name, () => {
	it(
		"estimates an unpaired difference of proportions over rep counts",
		estimatesAnUnpairedDifferenceOfProportionsOverRepCounts,
	);

	it(
		"reports a non-degenerate interval for each arm when every rep agrees",
		reportsANonDegenerateIntervalForEachArmWhenEveryRepAgrees,
	);
});

describe(buildSingleCaseMeanEstimate.name, () => {
	it(
		"estimates an unpaired difference of means over per-rep values",
		estimatesAnUnpairedDifferenceOfMeansOverPerRepValues,
	);

	it(
		"estimates the spread when only one arm varies",
		estimatesTheSpreadWhenOnlyOneArmVaries,
	);

	it(
		"records that an arm had no observed spread instead of a zero standard error",
		recordsThatAnArmHadNoObservedSpreadInsteadOfAZeroStandardError,
	);
});

function averagesWithinCasesBeforeEstimatingPairedDifferences(): void {
	const cases = [
		{
			caseId: "case-1",
			minuend: [SUCCESSFUL_OUTCOME_VALUE, SUCCESSFUL_OUTCOME_VALUE],
			subtrahend: [UNSUCCESSFUL_OUTCOME_VALUE, SUCCESSFUL_OUTCOME_VALUE],
		},
		{
			caseId: "case-2",
			minuend: [SUCCESSFUL_OUTCOME_VALUE, SUCCESSFUL_OUTCOME_VALUE],
			subtrahend: [UNSUCCESSFUL_OUTCOME_VALUE, UNSUCCESSFUL_OUTCOME_VALUE],
		},
	];

	const estimate = buildPairedEstimate(cases);

	expect(estimate).toEqual({
		caseDeltas: [
			{ caseId: "case-1", value: 0.5 },
			{ caseId: "case-2", value: 1 },
		],
		meanDelta: 0.75,
		standardError: 0.25,
	});
}

function ignoresRepOrdinalOrderWithinEachCaseArm(): void {
	const cases = [
		{
			caseId: "case-1",
			minuend: [SUCCESSFUL_OUTCOME_VALUE, UNSUCCESSFUL_OUTCOME_VALUE],
			subtrahend: [SUCCESSFUL_OUTCOME_VALUE, UNSUCCESSFUL_OUTCOME_VALUE],
		},
		{
			caseId: "case-2",
			minuend: [SUCCESSFUL_OUTCOME_VALUE, SUCCESSFUL_OUTCOME_VALUE],
			subtrahend: [UNSUCCESSFUL_OUTCOME_VALUE, UNSUCCESSFUL_OUTCOME_VALUE],
		},
	];

	const forward = buildPairedEstimate(cases);
	const reversed = buildPairedEstimate(
		cases.map((benchmarkCase) => ({
			caseId: benchmarkCase.caseId,
			minuend: benchmarkCase.minuend,
			subtrahend: benchmarkCase.subtrahend.toReversed(),
		})),
	);

	expect(forward).toEqual({
		caseDeltas: [
			{ caseId: "case-1", value: 0 },
			{ caseId: "case-2", value: 1 },
		],
		meanDelta: 0.5,
		standardError: 0.5,
	});
	expect(reversed).toEqual(forward);
}

function estimatesAnUnpairedDifferenceOfProportionsOverRepCounts(): void {
	const expected = {
		delta: { decimalPlaces: 10, value: 0.5 },
		standardError: { decimalPlaces: 4, value: 0.2453 },
	};
	const estimate = buildSingleCaseProportionEstimate({
		minuend: { requested: 6, successful: 5 },
		subtrahend: { requested: 6, successful: 2 },
	});

	expect(estimate.delta).toBeCloseTo(
		expected.delta.value,
		expected.delta.decimalPlaces,
	);
	expect(estimate.standardError).toBeCloseTo(
		expected.standardError.value,
		expected.standardError.decimalPlaces,
	);
}

function reportsANonDegenerateIntervalForEachArmWhenEveryRepAgrees(): void {
	const expected = {
		minuendHigh: 1,
		minuendLow: { decimalPlaces: 2, value: 0.61 },
		standardError: 0,
		subtrahendHigh: { decimalPlaces: 2, value: 0.39 },
		subtrahendLow: 0,
	};
	const estimate = buildSingleCaseProportionEstimate({
		minuend: { requested: 6, successful: 6 },
		subtrahend: { requested: 6, successful: 0 },
	});

	expect(estimate.standardError).toBe(expected.standardError);
	expect(estimate.minuend.interval.low).toBeCloseTo(
		expected.minuendLow.value,
		expected.minuendLow.decimalPlaces,
	);
	expect(estimate.minuend.interval.high).toBe(expected.minuendHigh);
	expect(estimate.subtrahend.interval.low).toBe(expected.subtrahendLow);
	expect(estimate.subtrahend.interval.high).toBeCloseTo(
		expected.subtrahendHigh.value,
		expected.subtrahendHigh.decimalPlaces,
	);
}

function estimatesAnUnpairedDifferenceOfMeansOverPerRepValues(): void {
	const observations = [
		{ minuend: 0.4, subtrahend: 0.35 },
		{ minuend: 0.44, subtrahend: 0.39 },
	];
	const expected = {
		delta: { decimalPlaces: 10, value: 0.05 },
		standardError: { decimalPlaces: 5, value: 0.028284 },
	};
	const estimate = buildSingleCaseMeanEstimate({
		minuend: observations.map(({ minuend }) => minuend),
		subtrahend: observations.map(({ subtrahend }) => subtrahend),
	});

	expect(estimate.delta).toBeCloseTo(
		expected.delta.value,
		expected.delta.decimalPlaces,
	);
	expect(estimate.spread.status).toBe("ESTIMATED");
	if (estimate.spread.status === "ESTIMATED") {
		expect(estimate.spread.standardError).toBeCloseTo(
			expected.standardError.value,
			expected.standardError.decimalPlaces,
		);
	}
}

function estimatesTheSpreadWhenOnlyOneArmVaries(): void {
	const observations = [
		{ minuend: 0.4, subtrahend: 0.37 },
		{ minuend: 0.44, subtrahend: 0.37 },
	];
	const DECIMAL_PLACES = 10;
	const EXPECTED_STANDARD_ERROR = 0.02;
	const estimate = buildSingleCaseMeanEstimate({
		minuend: observations.map(({ minuend }) => minuend),
		subtrahend: observations.map(({ subtrahend }) => subtrahend),
	});

	expect(estimate.spread.status).toBe("ESTIMATED");
	if (estimate.spread.status === "ESTIMATED") {
		expect(estimate.spread.standardError).toBeCloseTo(
			EXPECTED_STANDARD_ERROR,
			DECIMAL_PLACES,
		);
	}
}

function recordsThatAnArmHadNoObservedSpreadInsteadOfAZeroStandardError(): void {
	const observations = [
		{ minuend: 0.42, subtrahend: 0.37 },
		{ minuend: 0.42, subtrahend: 0.37 },
		{ minuend: 0.42, subtrahend: 0.37 },
		{ minuend: 0.42, subtrahend: 0.37 },
	];
	const DECIMAL_PLACES = 10;
	const EXPECTED_DELTA = 0.05;
	const estimate = buildSingleCaseMeanEstimate({
		minuend: observations.map(({ minuend }) => minuend),
		subtrahend: observations.map(({ subtrahend }) => subtrahend),
	});

	expect(estimate.delta).toBeCloseTo(EXPECTED_DELTA, DECIMAL_PLACES);
	expect(estimate.spread).toEqual({ status: "NO_OBSERVED_SPREAD" });
}
