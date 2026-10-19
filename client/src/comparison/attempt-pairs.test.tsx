import { describe, expect, it } from "bun:test";

import { within } from "@testing-library/react";

import type { ComparisonAttempt } from "#server/comparison-attempts";

import {
	ATTEMPTS,
	cell,
	graded,
	renderPairs,
	table,
} from "./attempt-pair-test-fixtures";
import AttemptPairs from "./attempt-pairs";

describe(AttemptPairs.name, () => {
	it(
		"lists each arm's attempts side by side, baseline arm first",
		listsEachArmSAttemptsSideBySideBaselineArmFirst,
	);

	it(
		"shows a session's recorded check outcome beside its separate saved state failures",
		showsASessionSRecordedCheckOutcomeBesideItsSeparateSavedStateFailures,
	);

	it(
		"shows each attempt's words and the blockers that fired on it",
		showsEachAttemptSWordsAndTheBlockersThatFiredOnIt,
	);

	it(
		"claims no change between attempts, since no record ties one arm's attempt to another's",
		claimsNoChangeBetweenAttemptsSinceNoRecordTiesOneArmSAttemptToAnotherS,
	);

	it(
		"leaves an arm's cell empty past its last attempt",
		leavesAnArmSCellEmptyPastItsLastAttempt,
	);

	it(
		"names the stage of each outcome a pipeline attempt recorded",
		namesTheStageOfEachOutcomeAPipelineAttemptRecorded,
	);
});

function listsEachArmSAttemptsSideBySideBaselineArmFirst(): void {
	renderPairs();

	const columns = within(table())
		.getAllByRole("columnheader")
		.map((header) => header.textContent);

	expect(columns).toEqual([
		"Attempt",
		"Control",
		"Baseline (before)",
		"Candidate (after)",
	]);
	expect(cell("Attempt 1", "Control")).toHaveTextContent("C");
	expect(cell("Attempt 1", "Baseline (before)")).toHaveTextContent("B");
	expect(cell("Attempt 1", "Candidate (after)")).toHaveTextContent("A");
	expect(cell("Attempt 2", "Control")).toHaveTextContent("D");
}

function showsASessionSRecordedCheckOutcomeBesideItsSeparateSavedStateFailures(): void {
	const attempt: ComparisonAttempt = {
		...graded({ grade: "A", ordinal: 1, words: 12 }),
		checks: { declared: 1, failing: [], passed: 1 },
		stateChecks: {
			declared: 1,
			failing: [{ detail: "history changed", name: "history-preserved" }],
			passed: 0,
		},
	};
	renderPairs({
		attempts: { ...ATTEMPTS, baseline: [attempt] },
		mode: "session",
	});

	const baseline = cell("Attempt 1", "Baseline (before)");
	expect(baseline).toHaveTextContent("Recorded checks passed");
	expect(baseline).toHaveTextContent("Reply / transcript: 1/1 checks passed");
	expect(baseline).toHaveTextContent("Saved state: 0/1 checks passed");
	expect(baseline).toHaveTextContent("history-preserved: history changed");
	expect(
		within(baseline).queryByText("A", { exact: true }),
	).not.toBeInTheDocument();
}

function showsEachAttemptSWordsAndTheBlockersThatFiredOnIt(): void {
	renderPairs();

	expect(cell("Attempt 2", "Baseline (before)")).toHaveTextContent("537 words");
	expect(cell("Attempt 2", "Baseline (before)")).toHaveTextContent(
		"fired shape · scope-declared",
	);
	expect(cell("Attempt 1", "Baseline (before)")).toHaveTextContent(
		"no blocker fired",
	);
}

function claimsNoChangeBetweenAttemptsSinceNoRecordTiesOneArmSAttemptToAnotherS(): void {
	renderPairs();

	expect(
		within(table()).queryByRole("columnheader", { name: /→/u }),
	).not.toBeInTheDocument();
	expect(within(table()).queryByText(/step|no change/u)).toBeNull();
}

function leavesAnArmSCellEmptyPastItsLastAttempt(): void {
	renderPairs({
		attempts: {
			...ATTEMPTS,
			candidate: [graded({ grade: "A", ordinal: 1, words: 396 })],
		},
	});

	expect(cell("Attempt 2", "Candidate (after)")).toHaveTextContent(
		"no attempt",
	);
}

function namesTheStageOfEachOutcomeAPipelineAttemptRecorded(): void {
	const attempt: ComparisonAttempt = {
		...graded({ grade: "B", ordinal: 1, words: 100 }),
		outcomes: {
			outcomes: [
				{ grade: "B", name: "build", status: "JUDGED", successful: true },
				{ name: "final", status: "NOT_REACHED", successful: false },
			],
			state: "available",
		},
	};
	renderPairs({
		attempts: { ...ATTEMPTS, baseline: [attempt] },
	});

	expect(cell("Attempt 1", "Baseline (before)")).toHaveTextContent("build B");
	expect(cell("Attempt 1", "Baseline (before)")).toHaveTextContent(
		"final not reached",
	);
}
