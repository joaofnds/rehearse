import { describe, expect, it } from "bun:test";

import {
	sessionHistoryAttemptCost,
	sessionHistoryRequestSeries,
} from "#benchmark/session-history";

import {
	INHERITED_REQUEST_PREFIX_LINES,
	rates,
	seriesWith,
} from "./session-history-pricing-test-fixtures";

function reportsTheCalculatedReadingUnavailableRatherThanZeroWhenTheTranscriptIsAbsent(): void {
	const cost = sessionHistoryAttemptCost({
		rates,
		reportedCostUsd: 0.039296,
		series: sessionHistoryRequestSeries({
			prefixLinesExcluded: 1268,
			transcript: undefined,
		}),
	});

	expect(cost.calculated).toEqual({
		reasons: ["the attempt has no saved transcript"],
		state: "unavailable",
	});
	expect(cost.difference).toEqual({
		reasons: ["the calculated reading is unavailable"],
		state: "unavailable",
	});
}

function reportsTheCalculatedReadingUnavailableRatherThanZeroWithoutRates(): void {
	const cost = sessionHistoryAttemptCost({
		rates: undefined,
		reportedCostUsd: 1.008294,
		series: seriesWith(INHERITED_REQUEST_PREFIX_LINES),
	});

	expect(cost.calculated).toEqual({
		reasons: ["no rate catalog was supplied"],
		state: "unavailable",
	});
	expect(cost.difference).toEqual({
		reasons: ["the calculated reading is unavailable"],
		state: "unavailable",
	});
}

function leavesTheProviderReadingCompleteWhileTheBoundaryIsUnknown(): void {
	const cost = sessionHistoryAttemptCost({
		rates,
		reportedCostUsd: 1.008294,
		series: seriesWith(),
	});

	expect(cost.reported).toEqual({ costUsd: 1.008294, state: "complete" });
	expect(cost.calculated).toEqual({
		reasons: ["the transcript carries no attempt boundary"],
		state: "unavailable",
	});
	expect(cost.difference).toEqual({
		reasons: ["the calculated reading is unavailable"],
		state: "unavailable",
	});
}

function reportsTheProviderReadingUnavailableRatherThanZeroWhenAbsent(): void {
	const cost = sessionHistoryAttemptCost({
		rates,
		reportedCostUsd: undefined,
		series: seriesWith(INHERITED_REQUEST_PREFIX_LINES),
	});

	expect(cost.reported).toEqual({
		reasons: ["the attempt record carries no provider cost"],
		state: "unavailable",
	});
	expect(cost.difference).toEqual({
		reasons: ["the provider reading is unavailable"],
		state: "unavailable",
	});
}

describe(sessionHistoryAttemptCost.name, () => {
	it(
		"reports the calculated reading unavailable rather than zero when the transcript is absent",
		reportsTheCalculatedReadingUnavailableRatherThanZeroWhenTheTranscriptIsAbsent,
	);
	it(
		"reports the calculated reading unavailable rather than zero without rates",
		reportsTheCalculatedReadingUnavailableRatherThanZeroWithoutRates,
	);
	it(
		"leaves the provider reading complete while the boundary is unknown",
		leavesTheProviderReadingCompleteWhileTheBoundaryIsUnknown,
	);
	it(
		"reports the provider reading unavailable rather than zero when absent",
		reportsTheProviderReadingUnavailableRatherThanZeroWhenAbsent,
	);
});
