import { describe, expect, it } from "bun:test";

import { sessionHistoryRequestSeries } from "#benchmark/session-history";

import { streamedRow, usageOf } from "./session-history-request-test-fixtures";

const STREAMING_OUTPUT_TOKENS = 8;

const SETTLED_OUTPUT_TOKENS = 581;

const CONFLICTING_SETTLED_OUTPUT_TOKENS = 590;

const LATER_STREAMING_OUTPUT_TOKENS = 40;

function takesTheUsageOfTheRowCarryingAStopReason(): void {
	const entry = usageOf([
		streamedRow("req-a", STREAMING_OUTPUT_TOKENS, null),
		streamedRow("req-a", STREAMING_OUTPUT_TOKENS, null),
		streamedRow("req-a", SETTLED_OUTPUT_TOKENS, "tool_use"),
	]);

	expect(entry).toMatchObject({
		line: 1,
		usage: { outputTokens: 581 },
		usageState: "complete",
	});
}

function takesTheUsageOfTwoFinalRowsThatAgree(): void {
	const entry = usageOf([
		streamedRow("req-a", STREAMING_OUTPUT_TOKENS, null),
		streamedRow("req-a", SETTLED_OUTPUT_TOKENS, "tool_use"),
		streamedRow("req-a", SETTLED_OUTPUT_TOKENS, "tool_use"),
	]);

	expect(entry).toMatchObject({
		usage: { outputTokens: 581 },
		usageState: "complete",
	});
}

function readsFinalRowsThatDisagreeAsAConflict(): void {
	const entry = usageOf([
		streamedRow("req-a", SETTLED_OUTPUT_TOKENS, "tool_use"),
		streamedRow("req-a", CONFLICTING_SETTLED_OUTPUT_TOKENS, "tool_use"),
	]);

	expect(entry?.usageState).toBe("conflict");
}

function readsARequestWithNoFinalRowAsIncompleteWithItsLastRowAsALowerBound(): void {
	const entry = usageOf([
		streamedRow("req-a", STREAMING_OUTPUT_TOKENS, null),
		streamedRow("req-a", LATER_STREAMING_OUTPUT_TOKENS, null),
	]);

	expect(entry).toEqual({
		line: 1,
		lowerBound: {
			cacheReadTokens: 100,
			cacheWriteTokens: 0,
			inputTokens: 2,
			outputTokens: 40,
		},
		model: "claude-opus-5",
		region: "attempt",
		requestId: "req-a",
		usageState: "incomplete",
	});
}

function leavesARequestWithNoFinalRowOutOfTheAttemptTotals(): void {
	const series = sessionHistoryRequestSeries({
		prefixLinesExcluded: 0,
		transcript: [
			streamedRow("req-a", SETTLED_OUTPUT_TOKENS, "end_turn"),
			streamedRow("req-b", LATER_STREAMING_OUTPUT_TOKENS, null),
		].join("\n"),
	});

	expect(series.attemptTotals).toMatchObject({
		countedRequestCount: 1,
		requestCount: 2,
		state: "incomplete",
		usage: { outputTokens: 581 },
	});
}

describe(sessionHistoryRequestSeries.name, () => {
	describe("when rows stream partial usage", () => {
		it(
			"takes the usage of the row carrying a stop reason",
			takesTheUsageOfTheRowCarryingAStopReason,
		);
		it(
			"takes the usage of two final rows that agree",
			takesTheUsageOfTwoFinalRowsThatAgree,
		);
		it(
			"reads final rows that disagree as a conflict",
			readsFinalRowsThatDisagreeAsAConflict,
		);
		it(
			"reads a request with no final row as incomplete with its last row as a lower bound",
			readsARequestWithNoFinalRowAsIncompleteWithItsLastRowAsALowerBound,
		);
		it(
			"leaves a request with no final row out of the attempt totals",
			leavesARequestWithNoFinalRowOutOfTheAttemptTotals,
		);
	});
});
