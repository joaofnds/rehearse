import { describe, expect, it } from "bun:test";

import { fireEvent, within } from "@testing-library/react";

import type {
	ConfirmationGroupRow,
	SessionAttemptRow,
} from "#server/run-history";

import RunHistoryPage from "./run-history-page";
import ConfirmationGroupRowBuilder from "./run-history-page-group-row-builder";
import SessionAttemptRowBuilder from "./run-history-page-session-row-builder";
import { cellOf } from "./run-history-page-test-driver";
import {
	registerRunHistoryTestCleanup,
	renderPage,
	respondingWith,
} from "./run-history-page-test-harness";

async function testShowsASavedStateFailureBesideSuccessfulRecordedReplyChecksInRuns(): Promise<void> {
	const attempt: SessionAttemptRow = new SessionAttemptRowBuilder({
		checks: { declared: 1, passed: 1, state: "available" },
		recordId: "attempt:session:brief-reply/disputed",
		savedState: { failed: 18, passed: 1, state: "assessed", total: 19 },
		uuid: "disputed",
	}).build();
	respondingWith({
		launches: [],
		rows: [
			attempt,
			{
				...attempt,
				recordId: "attempt:session:brief-reply/legacy",
				savedState: undefined,
				uuid: "legacy",
			},
		],
		unreadable: [],
	});
	await renderPage().findByText("disputed");
	expect(cellOf({ column: "Outcome", run: "disputed" })).toHaveTextContent(
		"recorded successful",
	);
	expect(cellOf({ column: "Outcome", run: "disputed" })).toHaveTextContent(
		"Saved state: 18 of 19 failed",
	);
	expect(cellOf({ column: "Outcome", run: "disputed" })).toHaveTextContent(
		"Assessment layers disagree",
	);
	expect(cellOf({ column: "Step grades", run: "disputed" })).toHaveTextContent(
		"1 of 1 reply/transcript check passed",
	);
	expect(cellOf({ column: "Outcome", run: "legacy" })).toHaveTextContent(
		"Saved state unavailable",
	);
	expect(
		within(cellOf({ column: "Outcome", run: "legacy" })).getByText(
			"Saved state unavailable",
		),
	).toHaveAttribute(
		"title",
		"No saved state assessment was recorded; declaration is unknown.",
	);
}

async function testShowsASessionGroupSReplyTranscriptLayerBesideFailedSavedStateAttempts(): Promise<void> {
	const group: ConfirmationGroupRow = new ConfirmationGroupRowBuilder({
		caseId: "brief-reply",
		finalOutcomes: { NOT_APPLICABLE: 6 },
		groupId: "control",
		recordId: "group:control",
		reps: 6,
		savedState: {
			assessed: 6,
			disagreements: 4,
			failed: 6,
			passed: 0,
			total: 6,
			unavailable: 0,
			unavailableReps: [],
		},
		successful: 4,
	}).build();
	respondingWith({ launches: [], rows: [group], unreadable: [] });
	await renderPage().findByText("control");
	expect(cellOf({ column: "Step grades", run: "control" })).toHaveTextContent(
		"Reply/transcript basis",
	);
	expect(cellOf({ column: "Step grades", run: "control" })).toHaveTextContent(
		"4/6 recorded successful",
	);
	expect(cellOf({ column: "Outcome", run: "control" })).toHaveTextContent(
		"Saved state: 0 of 6 assessed attempts passed",
	);
	expect(cellOf({ column: "Outcome", run: "control" })).toHaveTextContent(
		"6 failed · 0 of 6 unavailable",
	);
	expect(cellOf({ column: "Outcome", run: "control" })).toHaveTextContent(
		"Assessment layers disagree in 4 attempts",
	);
}

async function testKeepsASessionGroupSUnassessedSavedStateAttemptsSeparateFromAssessedPasses(): Promise<void> {
	const group: ConfirmationGroupRow = new ConfirmationGroupRowBuilder({
		caseId: "brief-reply",
		finalOutcomes: { NOT_APPLICABLE: 2 },
		groupId: "partial-state",
		recordId: "group:partial-state",
		savedState: {
			assessed: 1,
			disagreements: 0,
			failed: 0,
			passed: 1,
			total: 2,
			unavailable: 1,
			unavailableReps: [
				{ reason: "No saved session attempt was recorded.", repId: "missing" },
			],
		},
		successful: 2,
	}).build();
	respondingWith({ launches: [], rows: [group], unreadable: [] });
	await renderPage().findByText("partial-state");
	expect(cellOf({ column: "Outcome", run: "partial-state" })).toHaveTextContent(
		"Saved state: 1 of 1 assessed attempts passed",
	);
	expect(cellOf({ column: "Outcome", run: "partial-state" })).toHaveTextContent(
		"0 failed · 1 of 2 unavailable",
	);
	fireEvent.click(
		within(cellOf({ column: "Outcome", run: "partial-state" })).getByRole(
			"button",
			{ name: "Saved state coverage" },
		),
	);
	expect(cellOf({ column: "Outcome", run: "partial-state" })).toHaveTextContent(
		"missing: No saved session attempt was recorded.",
	);
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	describe("saved-state assessment layers", () => {
		it(
			"shows a saved-state failure beside successful recorded reply checks in Runs",
			testShowsASavedStateFailureBesideSuccessfulRecordedReplyChecksInRuns,
		);

		it(
			"shows a session group's reply/transcript layer beside failed saved-state attempts",
			testShowsASessionGroupSReplyTranscriptLayerBesideFailedSavedStateAttempts,
		);

		it(
			"keeps a session group's unassessed saved-state attempts separate from assessed passes",
			testKeepsASessionGroupSUnassessedSavedStateAttemptsSeparateFromAssessedPasses,
		);
	});
});
