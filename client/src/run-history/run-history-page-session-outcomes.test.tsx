import { describe, expect, it } from "bun:test";

import { UNREAD_STALENESS } from "#client/test-support/run-figures";
import type { SessionAttemptRow } from "#server/run-history";

import RunHistoryPage from "./run-history-page";
import SessionAttemptRowBuilder from "./run-history-page-session-row-builder";
import { cellOf } from "./run-history-page-test-driver";
import {
	registerRunHistoryTestCleanup,
	renderPage,
	respondingWith,
} from "./run-history-page-test-harness";
import type { RunHistoryResponse as RunHistoryResponseBody } from "./run-history-query";

const ATTEMPT = "0f6b6f2a-0000-4000-8000-000000000009";

const SESSION_CHECK_OUTCOMES = [
	[
		"a successful attempt",
		"SUCCESSFUL",
		{ declared: 3, passed: 3 },
		"✓recorded successfulall reply/transcript checks passed",
	],
	[
		"an unsuccessful attempt",
		"UNSUCCESSFUL",
		{ declared: 3, passed: 1 },
		"◼recorded unsuccessful2 of 3 reply/transcript checks failed",
	],
	[
		"an unsuccessful attempt with one check",
		"UNSUCCESSFUL",
		{ declared: 1, passed: 0 },
		"◼recorded unsuccessful1 of 1 reply/transcript check failed",
	],
] as const;

const REPLYLESS_SESSION_OUTCOMES = [
	["NO_REPLY", "the session gave no reply, so no check ran", "no reply"],
	[
		"EXECUTION_FAILED",
		"the session failed to run, so no check ran",
		"failed to run",
	],
] as const;

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

async function testReadsSessionCheckOutcome(
	...[_name, status, checks, expected]: SessionCheckOutcome
): Promise<void> {
	respondingWith(
		attemptWith({ checks: { state: "available", ...checks }, status }),
	);

	await renderPage().findByText(ATTEMPT);

	expect(cellOf({ column: "Outcome", run: ATTEMPT })).toHaveTextContent(
		expected,
	);
	expect(cellOf({ column: "Outcome", run: ATTEMPT })).toHaveTextContent(
		"Saved state unavailable",
	);
}

async function testReadsReplylessSessionOutcome(
	status: SessionAttemptRow["status"],
	reason: string,
	phrase: string,
): Promise<void> {
	respondingWith(
		attemptWith({
			checks: { reasons: [reason], state: "unavailable" },
			status,
		}),
	);

	await renderPage().findByText(ATTEMPT);

	expect(cellOf({ column: "Outcome", run: ATTEMPT }).textContent).toBe(
		`⊘${phrase}${reason}Saved state unavailable`,
	);
}

type SessionCheckOutcome = readonly [
	name: string,
	status: SessionAttemptRow["status"],
	checks: { readonly declared: number; readonly passed: number },
	expected: string,
];

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	describe("the outcome of a finished record", () => {
		describe("of a session attempt", () => {
			it.each(SESSION_CHECK_OUTCOMES)(
				"reads %s's outcome with its checks",
				testReadsSessionCheckOutcome,
			);
			it.each(REPLYLESS_SESSION_OUTCOMES)(
				"reads a %s attempt's outcome with why no check ran",
				testReadsReplylessSessionOutcome,
			);
		});
	});
});
