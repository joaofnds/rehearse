import { describe, expect, it } from "bun:test";

import {
	sessionHistoryAttemptCost,
	sessionHistoryRequestSeries,
} from "#benchmark/session-history";

import {
	INHERITED_REQUEST_PREFIX_LINES,
	pricedTranscript,
	rates,
} from "./session-history-pricing-test-fixtures";

/** The priced transcript's one attempt request, at the fixture's rates. */
const ATTEMPT_REQUEST_COST_USD = 1.009051;

const COST_COMPARISON_DECIMAL_PLACES = 6;

/** The priced transcript's one inherited request, counted from zero. */
const PREFIX_LINE_INDEX = 0;

function rootRequestsOf(
	transcript: readonly string[],
): ReturnType<typeof sessionHistoryAttemptCost>["rootRequests"] {
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

	expect(reading).toMatchObject({
		pricedRequestCount: 1,
		reasons: ["the attempt transcript's line 3 cannot be read"],
		requestCount: 2,
		state: "incomplete",
	});
}

function keepsTheReadableRequestsCost(): void {
	const reading = rootRequestsOf([pricedTranscript, "not json"]);

	expect(reading.state !== "unavailable" && reading.costUsd).toBeCloseTo(
		ATTEMPT_REQUEST_COST_USD,
		COST_COMPARISON_DECIMAL_PLACES,
	);
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
			"reads the root requests' cost incomplete, naming the line",
			readsUnreadableAttemptLineIncomplete,
		);
		it(
			"still counts the readable requests' cost",
			keepsTheReadableRequestsCost,
		);
	});
	describe("when the inherited prefix holds an unreadable line", () => {
		it("leaves the root requests' cost complete", ignoresUnreadablePrefixLine);
	});
});
