import { describe, expect, it } from "bun:test";

import { sessionHistoryRequestSeries } from "#benchmark/session-history";

import { row } from "./session-history-event-test-fixtures";
import { assistantRow } from "./session-history-request-test-fixtures";

const EXPECTED_REQUEST_COUNT = 1;

const EXPECTED_OUTPUT_TOKENS = 151;

function carriesTheCacheWriteTTLSplitTheRowReports(): void {
	const transcript = row({
		cwd: "/work",
		message: {
			content: [{ text: "reply", type: "text" }],
			model: "claude-sonnet-5",
			usage: {
				cache_creation: {
					ephemeral_1h_input_tokens: 251_695,
					ephemeral_5m_input_tokens: 0,
				},
				cache_creation_input_tokens: 251_695,
				cache_read_input_tokens: 0,
				input_tokens: 2,
				output_tokens: 151,
			},
		},
		requestId: "req-a",
		timestamp: "2026-09-14T00:00:01.000Z",
		type: "assistant",
	});

	const series = sessionHistoryRequestSeries({
		prefixLinesExcluded: 0,
		transcript,
	});

	const [entry] = series.entries;

	expect(entry?.usageState === "complete" && entry.cacheWriteSplit).toEqual({
		fiveMinuteTokens: 0,
		oneHourTokens: 251_695,
		state: "complete",
	});
}

function reportsTheTTLSplitMissingWhenTheRowOmitsIt(): void {
	const series = sessionHistoryRequestSeries({
		prefixLinesExcluded: 0,
		transcript: row(
			assistantRow("1", {
				model: "claude-sonnet-5",
				requestId: "req-a",
				usage: {
					cacheRead: 0,
					cacheWrite: 251_695,
					input: 2,
					output: 151,
				},
			}),
		),
	});

	const [entry] = series.entries;

	expect(entry?.usageState === "complete" && entry.cacheWriteSplit).toEqual({
		reasons: ["the row reports no cache-creation TTL split"],
		state: "missing",
	});
}

function keepsARequestWhoseTTLSplitReportsOnlyOneTierMarkingTheSplitMissing(): void {
	const transcript = row({
		cwd: "/work",
		message: {
			content: [{ text: "reply", type: "text" }],
			model: "claude-sonnet-5",
			usage: {
				cache_creation: { ephemeral_5m_input_tokens: 251_695 },
				cache_creation_input_tokens: 251_695,
				cache_read_input_tokens: 0,
				input_tokens: 2,
				output_tokens: 151,
			},
		},
		requestId: "req-a",
		timestamp: "2026-09-14T00:00:01.000Z",
		type: "assistant",
	});

	const series = sessionHistoryRequestSeries({
		prefixLinesExcluded: 0,
		transcript,
	});

	const [entry] = series.entries;

	expect(series.entries).toHaveLength(EXPECTED_REQUEST_COUNT);
	expect(entry?.usageState === "complete" && entry.usage.outputTokens).toBe(
		EXPECTED_OUTPUT_TOKENS,
	);
	expect(entry?.usageState === "complete" && entry.cacheWriteSplit).toEqual({
		reasons: ["the row's cache-creation TTL split is unreadable"],
		state: "missing",
	});
}

function reportsTheTTLSplitInConflictWhenItDisagreesWithCacheWriteUsage(): void {
	const transcript = row({
		cwd: "/work",
		message: {
			content: [{ text: "reply", type: "text" }],
			model: "claude-sonnet-5",
			usage: {
				cache_creation: {
					ephemeral_1h_input_tokens: 1,
					ephemeral_5m_input_tokens: 1,
				},
				cache_creation_input_tokens: 251_695,
				cache_read_input_tokens: 0,
				input_tokens: 2,
				output_tokens: 151,
			},
		},
		requestId: "req-a",
		timestamp: "2026-09-14T00:00:01.000Z",
		type: "assistant",
	});

	const series = sessionHistoryRequestSeries({
		prefixLinesExcluded: 0,
		transcript,
	});

	const [entry] = series.entries;

	expect(entry?.usageState === "complete" && entry.cacheWriteSplit).toEqual({
		reasons: ["the TTL split totals 2 against 251695 cache-write tokens"],
		state: "conflict",
	});
}

describe(sessionHistoryRequestSeries.name, () => {
	it(
		"carries the cache-write TTL split the row reports",
		carriesTheCacheWriteTTLSplitTheRowReports,
	);
	it(
		"reports the TTL split missing when the row omits it",
		reportsTheTTLSplitMissingWhenTheRowOmitsIt,
	);
	it(
		"keeps a request whose TTL split reports only one tier, marking the split missing",
		keepsARequestWhoseTTLSplitReportsOnlyOneTierMarkingTheSplitMissing,
	);
	it(
		"reports the TTL split in conflict when it disagrees with cache-write usage",
		reportsTheTTLSplitInConflictWhenItDisagreesWithCacheWriteUsage,
	);
});
