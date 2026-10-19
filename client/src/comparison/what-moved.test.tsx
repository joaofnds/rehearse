import { describe, expect, it } from "bun:test";

import { screen, within } from "@testing-library/react";

import WhatMoved from "./what-moved";
import {
	BLOCKER,
	COST,
	DIMENSION,
	OVERALL,
	REPLY_LENGTH,
	cell,
	renderWhatMoved,
	table,
} from "./what-moved-test-fixtures";

describe(WhatMoved.name, () => {
	it(
		"shows every arm's measure and an explicitly scoped candidate versus baseline reading",
		showsEveryArmSMeasureAndAnExplicitlyScopedCandidateVersusBaselineReading,
	);

	it(
		"keeps firing counts distinct from letter grades and labels their confidence interval",
		keepsFiringCountsDistinctFromLetterGradesAndLabelsTheirConfidenceInterval,
	);

	it(
		"shows cost and reply-length means beside all three observed ranges, units and coverage",
		showsCostAndReplyLengthMeansBesideAllThreeObservedRangesUnitsAndCoverage,
	);

	it(
		"names candidate as the arm that ran higher when its cost exceeds baseline",
		namesCandidateAsTheArmThatRanHigherWhenItsCostExceedsBaseline,
	);

	it(
		"preserves each arm's saved attempt denominator when they differ",
		preservesEachArmSSavedAttemptDenominatorWhenTheyDiffer,
	);
});

function showsEveryArmSMeasureAndAnExplicitlyScopedCandidateVersusBaselineReading(): void {
	renderWhatMoved([OVERALL, DIMENSION]);

	expect(
		within(table())
			.getAllByRole("columnheader")
			.map((header) => header.textContent),
	).toEqual([
		"Measure",
		"Control",
		"Baseline (before)",
		"Candidate (after)",
		"Range and uncertainty",
		"Candidate vs baseline",
	]);
	expect(cell("build", "Control")).toHaveTextContent("C · n=2");
	expect(cell("build", "Baseline (before)")).toHaveTextContent("C · n=2");
	expect(cell("build", "Candidate (after)")).toHaveTextContent("B · n=2");
	expect(cell("build", "Candidate vs baseline")).toHaveTextContent(
		"inside rerun noise",
	);
	expect(cell("observability", "Candidate vs baseline")).toHaveTextContent(
		"baseline (before) separates",
	);
	expect(cell("observability", "Baseline (before)")).toHaveTextContent(
		"A · n=2",
	);
}

function keepsFiringCountsDistinctFromLetterGradesAndLabelsTheirConfidenceInterval(): void {
	renderWhatMoved([BLOCKER]);

	expect(cell("scope-declared", "Control")).toHaveTextContent("2/2 fired");
	expect(cell("scope-declared", "Baseline (before)")).toHaveTextContent(
		"1/2 fired",
	);
	expect(cell("scope-declared", "Candidate (after)")).toHaveTextContent(
		"0/2 fired",
	);
	const range = cell("scope-declared", "Range and uncertainty");
	expect(range).toHaveTextContent("Firing rate · 95% confidence interval");
	expect(range).toHaveTextContent("0% to 66% · 0% observed rate");
	expect(range).toHaveTextContent("Control: range not recorded");
}

function showsCostAndReplyLengthMeansBesideAllThreeObservedRangesUnitsAndCoverage(): void {
	renderWhatMoved([REPLY_LENGTH, COST]);

	expect(cell("Reply length", "Baseline (before)")).toHaveTextContent(
		"524 words · n=2",
	);
	const words = cell("Reply length", "Range and uncertainty");
	expect(words).toHaveTextContent("259 words to 325 words · 292 words mean");
	expect(words).toHaveTextContent("510 words to 537 words · 524 words mean");
	expect(words).toHaveTextContent("396 words to 468 words · 432 words mean");
	expect(words).toHaveTextContent(
		"Mean and observed range · candidate mean -17% vs baseline",
	);
	expect(words).not.toHaveTextContent("confidence");
	expect(cell("Cost per attempt", "Candidate (after)")).toHaveTextContent(
		"$2.40 · n=2",
	);
	expect(cell("Cost per attempt", "Range and uncertainty")).toHaveTextContent(
		"$2.30 to $2.50 · $2.40 mean",
	);
}

function namesCandidateAsTheArmThatRanHigherWhenItsCostExceedsBaseline(): void {
	renderWhatMoved([COST]);

	expect(cell("Cost per attempt", "Baseline (before)")).toHaveTextContent(
		"$2.00 · n=2",
	);
	expect(cell("Cost per attempt", "Candidate (after)")).toHaveTextContent(
		"$2.40 · n=2",
	);
	expect(cell("Cost per attempt", "Candidate vs baseline")).toHaveTextContent(
		"candidate (after) ran higher",
	);
}

function preservesEachArmSSavedAttemptDenominatorWhenTheyDiffer(): void {
	renderWhatMoved([OVERALL], { baseline: 3, candidate: 2, control: 2 });

	expect(screen.getByText(/Saved attempts:/u)).toHaveTextContent(
		"Control 2 · Baseline (before) 3 · Candidate (after) 2",
	);
}
