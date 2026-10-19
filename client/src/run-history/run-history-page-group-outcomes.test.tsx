import { describe, expect, it } from "bun:test";

import { UNREAD_STALENESS } from "#client/test-support/run-figures";
import type { ConfirmationGroupRow } from "#server/run-history";

import RunHistoryPage from "./run-history-page";
import ConfirmationGroupRowBuilder from "./run-history-page-group-row-builder";
import { cellOf } from "./run-history-page-test-driver";
import {
	registerRunHistoryTestCleanup,
	renderPage,
	respondingWith,
} from "./run-history-page-test-harness";
import type { RunHistoryResponse as RunHistoryResponseBody } from "./run-history-query";

const GROUP = "group-0143";

function groupWith(
	figures: Pick<ConfirmationGroupRow, "reps" | "finalOutcomes" | "successful"> &
		Partial<Pick<ConfirmationGroupRow, "unreadReps">>,
): RunHistoryResponseBody {
	return {
		launches: [],
		rows: [
			new ConfirmationGroupRowBuilder({
				recordId: `group:${GROUP}`,
				...figures,
				caseId: "audit-log",
				checkpoint: undefined,
				corpusVersion: undefined,
				groupId: GROUP,
				links: [],
				mode: "session",
				repAttempts: [],
				shortId: undefined,
				staleness: UNREAD_STALENESS,
			}).build(),
		],
		unreadable: [],
	};
}

async function testReadsHowManyOfTheRepsItRequestedItRecordedAndHowManySucceeded(): Promise<void> {
	respondingWith(
		groupWith({ finalOutcomes: { NOT_APPLICABLE: 6 }, reps: 6, successful: 4 }),
	);

	await renderPage().findByText(GROUP);

	expect(cellOf({ column: "Outcome", run: GROUP }).textContent).toBe(
		"✓6 of 6 recorded4 recorded successful on reply/transcript checksSaved state unavailable",
	);
}

async function testMarksAGroupThatRecordedFewerRepsThanItRequestedAsCutShortNamingTheRepsItCouldNotRead(): Promise<void> {
	respondingWith(
		groupWith({
			finalOutcomes: { NOT_APPLICABLE: 2 },
			reps: 6,
			successful: 2,
			unreadReps: [{ reason: "the rep recorded nothing", repId: "rep-3" }],
		}),
	);

	await renderPage().findByText(GROUP);

	expect(cellOf({ column: "Outcome", run: GROUP }).textContent).toBe(
		"⊘2 of 6 recorded2 recorded successful on reply/transcript checks · rep-3: the rep recorded nothingSaved state unavailable",
	);
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	describe("the outcome of a finished record", () => {
		describe("of a confirmation group", () => {
			it(
				"reads how many of the reps it requested it recorded, and how many succeeded",
				testReadsHowManyOfTheRepsItRequestedItRecordedAndHowManySucceeded,
			);
			it(
				"marks a group that recorded fewer reps than it requested as cut short, naming the reps it could not read",
				testMarksAGroupThatRecordedFewerRepsThanItRequestedAsCutShortNamingTheRepsItCouldNotRead,
			);
		});
	});
});
