import { describe, expect, it } from "bun:test";

import { UNREAD_STALENESS } from "#client/test-support/run-figures";
import type { SessionAttemptRow } from "#server/run-history";
import SESSION_GRADE_REASON from "#server/session-grade-reason";

import RunHistoryPage from "./run-history-page";
import SessionAttemptRowBuilder from "./run-history-page-session-row-builder";
import { cellOf, expandedFinalOutcomeOf } from "./run-history-page-test-driver";
import {
	registerRunHistoryTestCleanup,
	renderPage,
	respondingWith,
} from "./run-history-page-test-harness";
import type { RunHistoryResponse as RunHistoryResponseBody } from "./run-history-query";

const ATTEMPT = "0f6b6f2a-0000-4000-8000-000000000009";

function attemptWith(
	figures: Pick<SessionAttemptRow, "status" | "checks">,
): RunHistoryResponseBody {
	return {
		launches: [],
		rows: [
			new SessionAttemptRowBuilder({
				recordId: `attempt:session:brief-reply/${ATTEMPT}`,
				...figures,
				caseId: "brief-reply",
				corpusVersion: undefined,
				links: [],
				shortId: undefined,
				staleness: UNREAD_STALENESS,
				uuid: ATTEMPT,
			}).build(),
		],
		unreadable: [],
	};
}

async function testReadsHowManyOfItsChecksPassedAsItsStepGrades(): Promise<void> {
	respondingWith(
		attemptWith({
			checks: { declared: 3, passed: 2, state: "available" },
			status: "UNSUCCESSFUL",
		}),
	);

	await renderPage().findByText(ATTEMPT);

	expect(cellOf({ column: "Step grades", run: ATTEMPT })).toHaveTextContent(
		"2 of 3 reply/transcript checks passed",
	);
}

async function testReadsItsOutcomeWithWhyNoCheckRanWhenItRecordedNone(): Promise<void> {
	respondingWith(
		attemptWith({
			checks: {
				reasons: ["the session gave no reply, so no check ran"],
				state: "unavailable",
			},
			status: "NO_REPLY",
		}),
	);

	await renderPage().findByText(ATTEMPT);

	expect(cellOf({ column: "Step grades", run: ATTEMPT })).toHaveTextContent(
		"NO_REPLYthe session gave no reply, so no check ran",
	);
}

async function testReadsNAWithWhyASessionHasNoLetterAsItsTaskGrade(): Promise<void> {
	respondingWith(
		attemptWith({
			checks: { declared: 1, passed: 1, state: "available" },
			status: "SUCCESSFUL",
		}),
	);

	await renderPage().findByText(ATTEMPT);

	expect(expandedFinalOutcomeOf(ATTEMPT)).toContain(
		`n/a${SESSION_GRADE_REASON}`,
	);
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	describe("the step grades and task grade of a session attempt", () => {
		it(
			"reads how many of its checks passed as its step grades",
			testReadsHowManyOfItsChecksPassedAsItsStepGrades,
		);

		it(
			"reads its outcome with why no check ran when it recorded none",
			testReadsItsOutcomeWithWhyNoCheckRanWhenItRecordedNone,
		);

		it(
			"reads n/a with why a session has no letter as its task grade",
			testReadsNAWithWhyASessionHasNoLetterAsItsTaskGrade,
		);
	});
});
