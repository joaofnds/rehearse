import { describe, expect, it } from "bun:test";

import { sessionHistoryRequestSeries } from "#benchmark/session-history";

import { row } from "./session-history-event-test-fixtures";
import { assistantRow } from "./session-history-request-test-fixtures";

const conflictingUsageTranscript = [
	row(
		assistantRow("1", {
			model: "claude-sonnet-5",
			requestId: "req-conflict",
			usage: {
				cacheRead: 0,
				cacheWrite: 20,
				input: 2,
				output: 10,
			},
		}),
	),
	row(
		assistantRow("2", {
			model: "claude-sonnet-5",
			requestId: "req-conflict",
			usage: {
				cacheRead: 0,
				cacheWrite: 20,
				input: 3,
				output: 10,
			},
		}),
	),
	row(
		assistantRow("3", {
			model: "claude-sonnet-5",
			requestId: "req-settled",
			usage: {
				cacheRead: 0,
				cacheWrite: 251_695,
				input: 2,
				output: 151,
			},
		}),
	),
].join("\n");

function totalsOnlyTheRequestsInsideTheAttemptRegion(): void {
	const transcript = [
		row(
			assistantRow("1", {
				model: "claude-opus-5",
				requestId: "req-inherited",
				usage: {
					cacheRead: 5,
					cacheWrite: 9,
					input: 7,
					output: 90_592,
				},
			}),
		),
		row(
			assistantRow("2", {
				model: "claude-sonnet-5",
				requestId: "req-attempt",
				usage: {
					cacheRead: 0,
					cacheWrite: 251_695,
					input: 2,
					output: 151,
				},
			}),
		),
	].join("\n");

	const series = sessionHistoryRequestSeries({
		prefixLinesExcluded: 1,
		transcript,
	});

	expect(series.boundary).toBe("known");
	expect(series.attemptTotals).toEqual({
		requestCount: 1,
		state: "complete",
		totalInputTokens: 251_697,
		usage: {
			cacheReadTokens: 0,
			cacheWriteTokens: 251_695,
			inputTokens: 2,
			outputTokens: 151,
		},
	});
}

function reportsAttemptTotalsUnavailableRatherThanZeroWhenTheBoundaryIsUnknown(): void {
	const transcript = row(
		assistantRow("1", {
			model: "claude-opus-5",
			requestId: "req-a",
			usage: {
				cacheRead: 0,
				cacheWrite: 251_695,
				input: 2,
				output: 151,
			},
		}),
	);

	const series = sessionHistoryRequestSeries({
		prefixLinesExcluded: undefined,
		transcript,
	});

	expect(series.attemptTotals).toEqual({
		reasons: ["the transcript carries no attempt boundary"],
		state: "unavailable",
	});
}

function marksAttemptTotalsIncompleteWhenARequestInTheRegionHasNoSettledUsage(): void {
	const series = sessionHistoryRequestSeries({
		prefixLinesExcluded: 0,
		transcript: conflictingUsageTranscript,
	});

	expect(series.attemptTotals).toEqual({
		countedRequestCount: 1,
		reasons: ["1 of 2 attempt-region requests carry no settled usage"],
		requestCount: 2,
		state: "incomplete",
		totalInputTokens: 251_697,
		usage: {
			cacheReadTokens: 0,
			cacheWriteTokens: 251_695,
			inputTokens: 2,
			outputTokens: 151,
		},
	});
}

describe(sessionHistoryRequestSeries.name, () => {
	it(
		"totals only the requests inside the attempt region",
		totalsOnlyTheRequestsInsideTheAttemptRegion,
	);
	it(
		"reports attempt totals unavailable rather than zero when the boundary is unknown",
		reportsAttemptTotalsUnavailableRatherThanZeroWhenTheBoundaryIsUnknown,
	);
	it(
		"marks attempt totals incomplete when a request in the region has no settled usage",
		marksAttemptTotalsIncompleteWhenARequestInTheRegionHasNoSettledUsage,
	);
});
