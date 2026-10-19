import { describe, expect, it } from "bun:test";

import { sessionHistoryRequestSeries } from "#benchmark/session-history";

import { row } from "./session-history-event-test-fixtures";
import { assistantRow } from "./session-history-request-test-fixtures";

function marksEachEntryWithTheRegionItsLineFallsIn(): void {
	const usage = { cacheRead: 100, cacheWrite: 20, input: 2, output: 10 };
	const transcript = [
		row(
			assistantRow("1", {
				model: "claude-opus-5",
				requestId: "req-inherited",
				usage,
			}),
		),
		row(
			assistantRow("2", {
				model: "claude-sonnet-5",
				requestId: "req-attempt",
				usage,
			}),
		),
	].join("\n");

	const series = sessionHistoryRequestSeries({
		prefixLinesExcluded: 1,
		transcript,
	});

	expect(
		series.entries.map(({ requestId, region }) => ({ region, requestId })),
	).toEqual([
		{ region: "starting-context", requestId: "req-inherited" },
		{ region: "attempt", requestId: "req-attempt" },
	]);
}

function reportsTotalsUnavailableRatherThanZeroWhenTheTranscriptIsAbsent(): void {
	const series = sessionHistoryRequestSeries({
		prefixLinesExcluded: 1268,
		transcript: undefined,
	});

	expect(series.boundary).toBe("known");
	expect(series.entries).toEqual([]);
	expect(series.attemptTotals).toEqual({
		reasons: ["the attempt has no saved transcript"],
		state: "unavailable",
	});
}

function marksEveryEntryBoundaryUnknownWhenTheTranscriptCarriesNoBoundary(): void {
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
				model: "claude-sonnet-5",
				requestId: "req-b",
				usage,
			}),
		),
	].join("\n");

	const series = sessionHistoryRequestSeries({
		prefixLinesExcluded: undefined,
		transcript,
	});

	expect(series.boundary).toBe("unknown");
	expect(series.entries.map(({ region }) => region)).toEqual([
		"boundary-unknown",
		"boundary-unknown",
	]);
}

describe(sessionHistoryRequestSeries.name, () => {
	it(
		"marks each entry with the region its line falls in",
		marksEachEntryWithTheRegionItsLineFallsIn,
	);
	it(
		"reports totals unavailable rather than zero when the transcript is absent",
		reportsTotalsUnavailableRatherThanZeroWhenTheTranscriptIsAbsent,
	);
	it(
		"marks every entry boundary-unknown when the transcript carries no boundary",
		marksEveryEntryBoundaryUnknownWhenTheTranscriptCarriesNoBoundary,
	);
});
