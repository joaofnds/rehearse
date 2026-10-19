import { describe, expect, it } from "bun:test";

import { sessionHistoryRequestSeries } from "#benchmark/session-history";

import { row } from "./session-history-event-test-fixtures";
import type { AssistantRequest } from "./session-history-request-test-fixtures";
import { assistantRow } from "./session-history-request-test-fixtures";

const distinctRequestTranscript = [
	row(
		assistantRow("1", {
			model: "claude-opus-5",
			requestId: "req-b",
			usage: {
				cacheRead: 100,
				cacheWrite: 20,
				input: 2,
				output: 10,
			},
		}),
	),
	row(
		assistantRow("2", {
			model: "claude-sonnet-5",
			requestId: "req-a",
			usage: {
				cacheRead: 200,
				cacheWrite: 30,
				input: 3,
				output: 11,
			},
		}),
	),
].join("\n");

function yieldsOneEntryPerDistinctRequestInTranscriptOrder(): void {
	const series = sessionHistoryRequestSeries({
		prefixLinesExcluded: 0,
		transcript: distinctRequestTranscript,
	});

	expect(
		series.entries.map((entry) => ({
			model: entry.model,
			requestId: entry.requestId,
			usage: entry.usageState === "complete" ? entry.usage : undefined,
		})),
	).toEqual([
		{
			model: "claude-opus-5",
			requestId: "req-b",
			usage: {
				cacheReadTokens: 100,
				cacheWriteTokens: 20,
				inputTokens: 2,
				outputTokens: 10,
			},
		},
		{
			model: "claude-sonnet-5",
			requestId: "req-a",
			usage: {
				cacheReadTokens: 200,
				cacheWriteTokens: 30,
				inputTokens: 3,
				outputTokens: 11,
			},
		},
	]);
}

function collapsesDuplicateRowsSharingARequestIntoOneEntry(): void {
	const usage = { cacheRead: 100, cacheWrite: 20, input: 2, output: 10 };
	const transcript = [
		row(
			assistantRow("1", {
				model: "claude-opus-5",
				requestId: "req-a",
				usage,
			}),
		),
		row(
			assistantRow("2", {
				model: "claude-opus-5",
				requestId: "req-a",
				usage,
			}),
		),
		row(
			assistantRow("3", {
				model: "claude-opus-5",
				requestId: "req-a",
				usage,
			}),
		),
	].join("\n");

	const series = sessionHistoryRequestSeries({
		prefixLinesExcluded: 0,
		transcript,
	});

	expect(
		series.entries.map(({ requestId, line, usageState }) => ({
			line,
			requestId,
			usageState,
		})),
	).toEqual([{ line: 1, requestId: "req-a", usageState: "complete" }]);
}

function reportsConflictingDuplicateTokenUsage(
	_category: string,
	second: AssistantRequest["usage"],
): void {
	const transcript = [
		row(
			assistantRow("1", {
				model: "claude-opus-5",
				requestId: "req-a",
				usage: {
					cacheRead: 100,
					cacheWrite: 20,
					input: 2,
					output: 10,
				},
			}),
		),
		row(
			assistantRow("2", {
				model: "claude-opus-5",
				requestId: "req-a",
				usage: second,
			}),
		),
	].join("\n");

	const series = sessionHistoryRequestSeries({
		prefixLinesExcluded: 0,
		transcript,
	});

	expect(series.entries).toEqual([
		{
			line: 1,
			model: "claude-opus-5",
			region: "attempt",
			requestId: "req-a",
			usageState: "conflict",
		},
	]);
}

function withholdsTheModelWhenDuplicatesDisagreeOnWhichOneRan(): void {
	const usage = { cacheRead: 100, cacheWrite: 20, input: 2, output: 10 };
	const transcript = [
		row(
			assistantRow("1", {
				model: "claude-opus-5",
				requestId: "req-a",
				usage,
			}),
		),
		row(
			assistantRow("2", {
				model: "claude-haiku-4-5",
				requestId: "req-a",
				usage,
			}),
		),
	].join("\n");

	const series = sessionHistoryRequestSeries({
		prefixLinesExcluded: 0,
		transcript,
	});

	expect(series.entries).toEqual([
		{
			cacheWriteSplit: {
				reasons: ["the row reports no cache-creation TTL split"],
				state: "missing",
			},
			cumulativeTotalInputTokens: 122,
			line: 1,
			model: undefined,
			modelState: "conflict",
			region: "attempt",
			requestId: "req-a",
			totalInputTokens: 122,
			usage: {
				cacheReadTokens: 100,
				cacheWriteTokens: 20,
				inputTokens: 2,
				outputTokens: 10,
			},
			usageState: "complete",
		},
	]);
}

describe(sessionHistoryRequestSeries.name, () => {
	it(
		"yields one entry per distinct request in transcript order",
		yieldsOneEntryPerDistinctRequestInTranscriptOrder,
	);
	it(
		"collapses duplicate rows sharing a request into one entry",
		collapsesDuplicateRowsSharingARequestIntoOneEntry,
	);
	it.each([
		["input", { cacheRead: 100, cacheWrite: 20, input: 5, output: 10 }],
		["output", { cacheRead: 100, cacheWrite: 20, input: 2, output: 11 }],
		["cache read", { cacheRead: 101, cacheWrite: 20, input: 2, output: 10 }],
		["cache write", { cacheRead: 100, cacheWrite: 21, input: 2, output: 10 }],
	])(
		"reports conflict when duplicates disagree on %s tokens",
		reportsConflictingDuplicateTokenUsage,
	);
	it(
		"withholds the model when duplicates disagree on which one ran",
		withholdsTheModelWhenDuplicatesDisagreeOnWhichOneRan,
	);
});
