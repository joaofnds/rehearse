import { describe, expect, it } from "bun:test";

import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

import { caseFigures, medianVerdict } from "./case-figures";
import CaseRunBuilder from "./case-run-test-builder";

const OLDER = "a".repeat(SHA256_HEX_DIGITS);

const NEWER = "b".repeat(SHA256_HEX_DIGITS);

describe("caseFigures", () => {
	it(
		"counts the runs at the latest corpus version and the ones it left out",
		verifyCaseFiguresCountsTheRunsAtTheLatestCorpusVersionAndTheOnesItLeftOut,
	);

	it(
		"takes the mean cost over the counted runs whose cost is recorded",
		verifyCaseFiguresTakesTheMeanCostOverTheCountedRunsWhoseCostIsRecorded,
	);

	it(
		"counts only the judged runs toward the passed figure",
		verifyCaseFiguresCountsOnlyTheJudgedRunsTowardThePassedFigure,
	);

	it(
		"reads no runs rather than zero figures for a case that never ran",
		verifyCaseFiguresReadsNoRunsRatherThanZeroFiguresForACaseThatNeverRan,
	);

	describe("when no counted run recorded its cost", () => {
		it(
			"serves no mean",
			verifyCaseFiguresWhenNoCountedRunRecordedItsCostServesNoMean,
		);
	});

	describe("when no run recorded a corpus version", () => {
		it(
			"counts every run under no version",
			verifyCaseFiguresWhenNoRunRecordedACorpusVersionCountsEveryRunUnderNoVersion,
		);
	});
});

describe("medianVerdict", () => {
	it.each([
		{ judged: 4, median: "PASS", passed: 3 },
		{ judged: 4, median: "FAIL", passed: 2 },
		{ judged: 1, median: "PASS", passed: 1 },
		{ judged: 3, median: "FAIL", passed: 0 },
		{ judged: 3, median: "PASS", passed: 2 },
	] as const)(
		"reads $median for $passed of $judged passed, the lower middle on an even count",
		({ passed, judged, median }) => {
			expect(medianVerdict({ judged, passed })).toBe(median);
		},
	);

	it(
		"reads no verdict when nothing was judged",
		verifyMedianVerdictReadsNoVerdictWhenNothingWasJudged,
	);
});

function verifyCaseFiguresCountsTheRunsAtTheLatestCorpusVersionAndTheOnesItLeftOut(): void {
	const figures = caseFigures([
		new CaseRunBuilder().build(),
		new CaseRunBuilder({ corpusDigest: NEWER, passed: false }).build(),
		new CaseRunBuilder({ corpusDigest: OLDER }).build(),
		new CaseRunBuilder({ corpusDigest: undefined }).build(),
	]);

	expect(figures).toMatchObject({
		corpusVersion: NEWER,
		counted: 2,
		judged: 2,
		leftOut: 2,
		passed: 1,
		state: "measured",
	});
}

function verifyCaseFiguresTakesTheMeanCostOverTheCountedRunsWhoseCostIsRecorded(): void {
	const figures = caseFigures([
		new CaseRunBuilder({ costUsd: 1 }).build(),
		new CaseRunBuilder({ costUsd: 2 }).build(),
		new CaseRunBuilder({ costUsd: undefined }).build(),
		new CaseRunBuilder({ corpusDigest: OLDER, costUsd: 50 }).build(),
	]);

	expect(figures).toMatchObject({
		costPerRun: { costed: 2, lacking: 1, meanUsd: 1.5 },
	});
}

function verifyCaseFiguresCountsOnlyTheJudgedRunsTowardThePassedFigure(): void {
	const figures = caseFigures([
		new CaseRunBuilder().build(),
		new CaseRunBuilder({ passed: undefined }).build(),
	]);

	expect(figures).toMatchObject({ counted: 2, judged: 1, passed: 1 });
}

function verifyCaseFiguresReadsNoRunsRatherThanZeroFiguresForACaseThatNeverRan(): void {
	expect(caseFigures([])).toEqual({ state: "no-runs" });
}

function verifyCaseFiguresWhenNoCountedRunRecordedItsCostServesNoMean(): void {
	expect(
		caseFigures([new CaseRunBuilder({ costUsd: undefined }).build()]),
	).toMatchObject({
		costPerRun: { costed: 0, lacking: 1, meanUsd: null },
	});
}

function verifyCaseFiguresWhenNoRunRecordedACorpusVersionCountsEveryRunUnderNoVersion(): void {
	const figures = caseFigures([
		new CaseRunBuilder({ corpusDigest: undefined }).build(),
		new CaseRunBuilder({ corpusDigest: undefined }).build(),
	]);

	expect(figures).toMatchObject({
		corpusVersion: null,
		counted: 2,
		leftOut: 0,
	});
}

function verifyMedianVerdictReadsNoVerdictWhenNothingWasJudged(): void {
	expect(medianVerdict({ judged: 0, passed: 0 })).toBeNull();
}
