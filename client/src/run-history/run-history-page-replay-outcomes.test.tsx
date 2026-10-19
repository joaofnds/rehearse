import { describe, expect, it } from "bun:test";

import { UNREAD_STALENESS } from "#client/test-support/run-figures";
import type { ReplayRow } from "#server/run-history";

import RunHistoryPage from "./run-history-page";
import ReplayRowBuilder from "./run-history-page-replay-row-builder";
import { cellOf } from "./run-history-page-test-driver";
import {
	registerRunHistoryTestCleanup,
	renderPage,
	respondingWith,
} from "./run-history-page-test-harness";
import type { RunHistoryResponse as RunHistoryResponseBody } from "./run-history-query";

const REPLAY = "2026-09-21T09-20-00.000Z";

function replayWith(
	figures: Pick<ReplayRow, "status" | "attempt">,
): RunHistoryResponseBody {
	return {
		launches: [],
		rows: [
			new ReplayRowBuilder({
				recordId: `attempt:stage:60758c/${REPLAY}`,
				...figures,
				caseId: "audit-log",
				checkpointShortId: undefined,
				corpusVersion: undefined,
				grade: "B+",
				lineage: "60758c",
				links: [],
				shortId: undefined,
				stage: "build",
				staleness: UNREAD_STALENESS,
				timestamp: REPLAY,
			}).build(),
		],
		unreadable: [],
	};
}

async function testReadsItsVerdictWithItsAttemptSPlaceAtItsCheckpoint(): Promise<void> {
	respondingWith(
		replayWith({ attempt: { count: 3, position: 3 }, status: "CONTINUE" }),
	);

	await renderPage().findByText(REPLAY);

	expect(cellOf({ column: "Outcome", run: REPLAY }).textContent).toBe(
		"✓verdict CONTINUEattempt 3 of 3 at this checkpoint",
	);
}

async function testReadsAStopVerdictWithoutCallingTheReplayAFailure(): Promise<void> {
	respondingWith(
		replayWith({ attempt: { count: 2, position: 1 }, status: "STOP" }),
	);

	await renderPage().findByText(REPLAY);

	expect(cellOf({ column: "Outcome", run: REPLAY }).textContent).toBe(
		"◼verdict STOPattempt 1 of 2 at this checkpoint",
	);
}

async function testSaysWhenItsAttemptSPlaceWasNotRecorded(): Promise<void> {
	respondingWith(replayWith({ attempt: undefined, status: "CONTINUE" }));

	await renderPage().findByText(REPLAY);

	expect(cellOf({ column: "Outcome", run: REPLAY }).textContent).toBe(
		"✓verdict CONTINUEattempt position not recorded",
	);
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	describe("the outcome of a finished record", () => {
		describe("of a replay", () => {
			it(
				"reads its verdict, with its attempt's place at its checkpoint",
				testReadsItsVerdictWithItsAttemptSPlaceAtItsCheckpoint,
			);
			it(
				"reads a stop verdict without calling the replay a failure",
				testReadsAStopVerdictWithoutCallingTheReplayAFailure,
			);
			it(
				"says when its attempt's place was not recorded",
				testSaysWhenItsAttemptSPlaceWasNotRecorded,
			);
		});
	});
});
