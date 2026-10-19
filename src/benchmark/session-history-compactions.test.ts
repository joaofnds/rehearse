import { describe, expect, it } from "bun:test";

import { sessionHistoryRequestSeries } from "#benchmark/session-history";

import {
	assistant,
	withCompaction,
} from "./session-history-compaction-test-fixtures";

const EXPECTED_FIRST_CUMULATIVE_INPUT_TOKENS = 100;

const EXPECTED_CUMULATIVE_INPUT_TOKENS = 120;

const BEFORE_COMPACTION_INPUT_TOKENS = 100;

const AFTER_COMPACTION_INPUT_TOKENS = 20;

function continuesCumulativeUsageAcrossACompactionWithoutResetting(): void {
	const series = sessionHistoryRequestSeries({
		prefixLinesExcluded: 0,
		transcript: withCompaction,
	});

	expect(
		series.entries.map((entry) =>
			entry.usageState === "complete"
				? entry.cumulativeTotalInputTokens
				: undefined,
		),
	).toEqual([
		EXPECTED_FIRST_CUMULATIVE_INPUT_TOKENS,
		EXPECTED_CUMULATIVE_INPUT_TOKENS,
	]);
}

function countsInheritedRequestsInTheRunningTotalOfAnAttemptRegionRow(): void {
	const series = sessionHistoryRequestSeries({
		prefixLinesExcluded: 1,
		transcript: [
			assistant(
				"req-1",
				"2026-09-14T00:00:01.000Z",
				BEFORE_COMPACTION_INPUT_TOKENS,
			),
			assistant(
				"req-2",
				"2026-09-14T00:00:03.000Z",
				AFTER_COMPACTION_INPUT_TOKENS,
			),
		].join("\n"),
	});

	expect(
		series.entries.map((entry) => ({
			cumulative:
				entry.usageState === "complete"
					? entry.cumulativeTotalInputTokens
					: undefined,
			region: entry.region,
		})),
	).toEqual([
		{ cumulative: 100, region: "starting-context" },
		{ cumulative: 120, region: "attempt" },
	]);
}

function marksTheCompactionOnTheSeries(): void {
	const series = sessionHistoryRequestSeries({
		prefixLinesExcluded: 0,
		transcript: withCompaction,
	});

	expect(series.compactions).toEqual([
		{ line: 2, region: "attempt", trigger: "auto" },
	]);
}

function placesACompactionInTheInheritedPrefixOutsideTheAttemptRegion(): void {
	const series = sessionHistoryRequestSeries({
		prefixLinesExcluded: 2,
		transcript: withCompaction,
	});

	expect(series.compactions).toEqual([
		{ line: 2, region: "starting-context", trigger: "auto" },
	]);
}

function reportsNoCompactionsForATranscriptThatCarriesNone(): void {
	const series = sessionHistoryRequestSeries({
		prefixLinesExcluded: 0,
		transcript: assistant(
			"req-1",
			"2026-09-14T00:00:01.000Z",
			BEFORE_COMPACTION_INPUT_TOKENS,
		),
	});

	expect(series.compactions).toEqual([]);
}

describe("compaction in a request series", () => {
	it(
		"continues cumulative usage across a compaction without resetting",
		continuesCumulativeUsageAcrossACompactionWithoutResetting,
	);
	it(
		"counts inherited requests in the running total of an attempt-region row",
		countsInheritedRequestsInTheRunningTotalOfAnAttemptRegionRow,
	);
	it("marks the compaction on the series", marksTheCompactionOnTheSeries);
	it(
		"places a compaction in the inherited prefix outside the attempt region",
		placesACompactionInTheInheritedPrefixOutsideTheAttemptRegion,
	);
	it(
		"reports no compactions for a transcript that carries none",
		reportsNoCompactionsForATranscriptThatCarriesNone,
	);
});
