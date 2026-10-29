import { describe, expect, it } from "bun:test";

import {
	sessionHistoryAttemptCost,
	sessionHistoryRequestSeries,
} from "#benchmark/session-history";
import type { SessionHistoryCostReading } from "#benchmark/session-history";

import {
	INHERITED_REQUEST_PREFIX_LINES,
	pricedTranscript,
	rates,
} from "./session-history-pricing-test-fixtures";

/** The priced transcript, two lines, holds one attempt request at these rates. */
const ATTEMPT_REQUEST_COST_USD = 1.009051;

/** The priced transcript's one inherited request, counted from zero. */
const PREFIX_LINE_INDEX = 0;

function rootRequestsOf(
	transcript: readonly string[],
): SessionHistoryCostReading {
	return sessionHistoryAttemptCost({
		rates,
		reportedCostUsd: undefined,
		series: sessionHistoryRequestSeries({
			prefixLinesExcluded: INHERITED_REQUEST_PREFIX_LINES,
			transcript: transcript.join("\n"),
		}),
	}).rootRequests;
}

function readsUnreadableAttemptLineIncomplete(): void {
	const reading = rootRequestsOf([
		pricedTranscript,
		'{"type":"assistant","requestId":"req-cut',
	]);

	expect(reading).toEqual({
		costUsd: ATTEMPT_REQUEST_COST_USD,
		pricedRequestCount: 1,
		reasons: ["the attempt transcript's line 3 cannot be read"],
		requestCount: 1,
		state: "incomplete",
	});
}

function ignoresUnreadablePrefixLine(): void {
	const reading = rootRequestsOf(
		pricedTranscript.split("\n").with(PREFIX_LINE_INDEX, "not json"),
	);

	expect(reading).toEqual({
		costUsd: ATTEMPT_REQUEST_COST_USD,
		state: "complete",
	});
}

describe(sessionHistoryAttemptCost.name, () => {
	describe("when an attempt line of the root transcript cannot be read", () => {
		it(
			"reads the root requests' cost incomplete over its readable requests, naming the line",
			readsUnreadableAttemptLineIncomplete,
		);
	});
	describe("when the inherited prefix holds an unreadable line", () => {
		it("leaves the root requests' cost complete", ignoresUnreadablePrefixLine);
	});
});
