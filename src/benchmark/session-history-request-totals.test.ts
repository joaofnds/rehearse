import { describe, expect, it } from "bun:test";

import { sessionHistoryRequestSeries } from "#benchmark/session-history";

import { row } from "./session-history-event-test-fixtures";
import type { AssistantRequest } from "./session-history-request-test-fixtures";
import {
	assistantRow,
	syntheticRequestTranscript,
} from "./session-history-request-test-fixtures";

const EXPECTED_TOTAL_INPUT_TOKENS = 281_697;

function totalsTheThreeInputCategoriesAsTotalInputTokens(): void {
	const transcript = row(
		assistantRow("1", {
			model: "claude-opus-5",
			requestId: "req-a",
			usage: {
				cacheRead: 30_000,
				cacheWrite: 251_695,
				input: 2,
				output: 151,
			},
		}),
	);

	const series = sessionHistoryRequestSeries({
		prefixLinesExcluded: 0,
		transcript,
	});

	const [entry] = series.entries;

	expect(entry?.usageState).toBe("complete");
	expect(entry?.usageState === "complete" && entry.totalInputTokens).toBe(
		EXPECTED_TOTAL_INPUT_TOKENS,
	);
}

function countsSyntheticRequestsAtZero(
	_label: string,
	requestId: AssistantRequest["requestId"],
): void {
	const transcript = syntheticRequestTranscript(requestId);

	const series = sessionHistoryRequestSeries({
		prefixLinesExcluded: 0,
		transcript,
	});

	expect(
		series.entries.map((entry) => ({
			model: entry.model,
			requestId: entry.requestId,
			totalInputTokens:
				entry.usageState === "complete" ? entry.totalInputTokens : undefined,
		})),
	).toEqual([
		{ model: "<synthetic>", requestId: undefined, totalInputTokens: 0 },
		{
			model: "claude-sonnet-5",
			requestId: "req-a",
			totalInputTokens: 251_697,
		},
	]);
}

function namesWhatTheTotalOmitsWithoutClaimingTheCategoriesOverlap(): void {
	const series = sessionHistoryRequestSeries({
		prefixLinesExcluded: 0,
		transcript: row(
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
		),
	});

	expect(series.name).toBe("total input tokens");
	expect(series.omits).toEqual([
		"the request's own output tokens",
		"the model's context window limit, which the transcript does not carry",
	]);
	expect(series.measuresActiveContextWindow).toBe(false);
}

describe(sessionHistoryRequestSeries.name, () => {
	it(
		"totals the three input categories as total input tokens",
		totalsTheThreeInputCategoriesAsTotalInputTokens,
	);
	it.each([
		["absent from the row", undefined],
		["present and null", null],
	])(
		"values a row whose requestId is %s at zero rather than omitting it",
		countsSyntheticRequestsAtZero,
	);
	it(
		"names what the total omits without claiming the categories overlap",
		namesWhatTheTotalOmitsWithoutClaimingTheCategoriesOverlap,
	);
});
