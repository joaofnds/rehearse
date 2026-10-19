import { describe, expect, it } from "bun:test";

import { screen, within } from "@testing-library/react";

import type { ComparisonAttempt } from "#server/comparison-attempts";

import { cell, graded, renderPairs } from "./attempt-pair-test-fixtures";
import AttemptPairs from "./attempt-pairs";

describe(AttemptPairs.name, () => {
	it(
		"states once why words or blockers were not recorded",
		statesOnceWhyWordsOrBlockersWereNotRecorded,
	);

	it(
		"states once why outcomes were not recorded",
		statesOnceWhyOutcomesWereNotRecorded,
	);

	describe("attempt history", () => {
		it(
			"links each attempt whose saved history the comparison still vouches for, and marks the rest stale",
			linksEachAttemptWhoseSavedHistoryTheComparisonStillVouchesForAndMarksTheRestStale,
		);

		it(
			"says a comparison that records no session has no attempt history to open",
			saysAComparisonThatRecordsNoSessionHasNoAttemptHistoryToOpen,
		);

		it(
			"claims no missing session for a session comparison that links no attempt",
			claimsNoMissingSessionForASessionComparisonThatLinksNoAttempt,
		);
	});
});

function statesOnceWhyWordsOrBlockersWereNotRecorded(): void {
	const unrecorded: ComparisonAttempt = {
		...graded({ grade: "B", ordinal: 1, words: 0 }),
		blockersFired: { reason: "no blocker grading", state: "unavailable" },
		words: { reason: "no word count", state: "unavailable" },
	};
	renderPairs({
		attempts: {
			baseline: [unrecorded],
			candidate: [unrecorded],
			control: [unrecorded],
		},
	});

	expect(cell("Attempt 1", "Baseline (before)")).toHaveTextContent(
		"words not recorded",
	);
	expect(
		screen.getByText("Words not recorded: no word count."),
	).toBeInTheDocument();
	expect(
		screen.getByText("Blockers not recorded: no blocker grading."),
	).toBeInTheDocument();
}

function statesOnceWhyOutcomesWereNotRecorded(): void {
	const unrecorded: ComparisonAttempt = {
		...graded({ grade: "B", ordinal: 1, words: 10 }),
		outcomes: { reason: "no per-attempt outcomes", state: "unavailable" },
	};
	renderPairs({
		attempts: {
			baseline: [unrecorded],
			candidate: [unrecorded],
			control: [unrecorded],
		},
	});

	expect(cell("Attempt 1", "Baseline (before)")).toHaveTextContent(
		"outcome not recorded",
	);
	expect(
		screen.getByText("Outcomes not recorded: no per-attempt outcomes."),
	).toBeInTheDocument();
}

function linksEachAttemptWhoseSavedHistoryTheComparisonStillVouchesForAndMarksTheRestStale(): void {
	renderPairs({
		histories: {
			baseline: [
				{
					groupId: "g",
					href: "/groups/g/reps/rep-1/attempt",
					ordinal: 1,
					repId: "rep-1",
					status: "available",
				},
			],
			candidate: [],
			control: [{ ordinal: 1, repId: "rep-1", status: "stale" }],
		},
		mode: "session",
	});

	expect(
		within(cell("Attempt 1", "Baseline (before)")).getByRole("link", {
			name: "Baseline (before) attempt 1 history",
		}),
	).toHaveAttribute(
		"href",
		"/groups/g/reps/rep-1/attempt?view=context&comparison=test-comparison",
	);
	expect(cell("Attempt 1", "Control")).toHaveTextContent("stale");
}

function saysAComparisonThatRecordsNoSessionHasNoAttemptHistoryToOpen(): void {
	renderPairs();

	expect(screen.queryByRole("link")).not.toBeInTheDocument();
	expect(
		screen.getByText(
			"No attempt history to open: a stage comparison's attempts record no session.",
		),
	).toBeInTheDocument();
}

function claimsNoMissingSessionForASessionComparisonThatLinksNoAttempt(): void {
	renderPairs({ mode: "session" });

	expect(
		screen.queryByText(/No attempt history to open/u),
	).not.toBeInTheDocument();
}
