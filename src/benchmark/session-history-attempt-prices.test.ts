import { describe, expect, it } from "bun:test";

import {
	sessionHistoryAttemptCost,
	sessionHistoryRequestSeries,
} from "#benchmark/session-history";

import { row } from "./session-history-event-test-fixtures";
import {
	INHERITED_REQUEST_PREFIX_LINES,
	NO_PREFIX_LINES,
	bothModels,
	rates,
	seriesWith,
} from "./session-history-pricing-test-fixtures";

const EXPECTED_REQUEST_COST_USD = 1.009051;

const COST_COMPARISON_DECIMAL_PLACES = 6;

const EXPECTED_COST_DIFFERENCE_USD = -0.000757;

const EXPECTED_WHOLE_TRANSCRIPT_COST_USD = 2.3683135;

const RECORDED_PROVIDER_COST_USD = 1.008294;

const conflictingPriceTranscript = [
	row({
		cwd: "/work",
		message: {
			content: [{ text: "reply", type: "text" }],
			model: "claude-sonnet-5",
			usage: {
				cache_creation: {
					ephemeral_1h_input_tokens: 20,
					ephemeral_5m_input_tokens: 0,
				},
				cache_creation_input_tokens: 20,
				cache_read_input_tokens: 0,
				input_tokens: 2,
				output_tokens: 10,
			},
		},
		requestId: "req-conflict",
		timestamp: "2026-09-14T00:00:01.000Z",
		type: "assistant",
	}),
	row({
		cwd: "/work",
		message: {
			content: [{ text: "reply", type: "text" }],
			model: "claude-sonnet-5",
			usage: {
				cache_creation: {
					ephemeral_1h_input_tokens: 20,
					ephemeral_5m_input_tokens: 0,
				},
				cache_creation_input_tokens: 20,
				cache_read_input_tokens: 0,
				input_tokens: 3,
				output_tokens: 10,
			},
		},
		requestId: "req-conflict",
		timestamp: "2026-09-14T00:00:02.000Z",
		type: "assistant",
	}),
	row({
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
		requestId: "req-priced",
		timestamp: "2026-09-14T00:00:03.000Z",
		type: "assistant",
	}),
].join("\n");

const zeroUsageTranscript = [
	row({
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
		requestId: "req-attempt",
		timestamp: "2026-09-14T00:00:01.000Z",
		type: "assistant",
	}),
	row({
		cwd: "/work",
		message: {
			content: [{ text: "api error", type: "text" }],
			model: "<synthetic>",
			usage: {
				cache_creation: {
					ephemeral_1h_input_tokens: 0,
					ephemeral_5m_input_tokens: 0,
				},
				cache_creation_input_tokens: 0,
				cache_read_input_tokens: 0,
				input_tokens: 0,
				output_tokens: 0,
			},
		},
		timestamp: "2026-09-14T00:00:02.000Z",
		type: "assistant",
	}),
].join("\n");

function reportsProviderCalculatedAndDifferenceAsThreeReadings(): void {
	const cost = sessionHistoryAttemptCost({
		rates,
		reportedCostUsd: 1.008294,
		series: seriesWith(INHERITED_REQUEST_PREFIX_LINES),
	});

	expect(cost.reported).toEqual({ costUsd: 1.008294, state: "complete" });
	expect(cost.calculated.state).toBe("complete");
	expect(
		cost.calculated.state === "complete" && cost.calculated.costUsd,
	).toBeCloseTo(EXPECTED_REQUEST_COST_USD, COST_COMPARISON_DECIMAL_PLACES);
	expect(cost.difference.state).toBe("complete");
	expect(
		cost.difference.state === "complete" && cost.difference.costUsd,
	).toBeCloseTo(EXPECTED_COST_DIFFERENCE_USD, COST_COMPARISON_DECIMAL_PLACES);
}

function pricesAZeroUsageRowAtZeroWithoutACataloguedRate(): void {
	const cost = sessionHistoryAttemptCost({
		rates,
		reportedCostUsd: 1.008294,
		series: sessionHistoryRequestSeries({
			prefixLinesExcluded: 0,
			transcript: zeroUsageTranscript,
		}),
	});

	expect(cost.calculated.state).toBe("complete");
	expect(
		cost.calculated.state === "complete" && cost.calculated.costUsd,
	).toBeCloseTo(EXPECTED_REQUEST_COST_USD, COST_COMPARISON_DECIMAL_PLACES);
}

function pricesOnlyTheAttemptRegionLeavingInheritedRequestsOut(): void {
	const confined = sessionHistoryAttemptCost({
		rates: bothModels,
		reportedCostUsd: 1.008294,
		series: seriesWith(INHERITED_REQUEST_PREFIX_LINES),
	});
	const wholeTranscript = sessionHistoryAttemptCost({
		rates: bothModels,
		reportedCostUsd: 1.008294,
		series: seriesWith(NO_PREFIX_LINES),
	});

	expect(
		confined.calculated.state === "complete" && confined.calculated.costUsd,
	).toBeCloseTo(EXPECTED_REQUEST_COST_USD, COST_COMPARISON_DECIMAL_PLACES);
	expect(
		wholeTranscript.calculated.state === "complete" &&
			wholeTranscript.calculated.costUsd,
	).toBeCloseTo(
		EXPECTED_WHOLE_TRANSCRIPT_COST_USD,
		COST_COMPARISON_DECIMAL_PLACES,
	);
}

function refusesToPriceARequestWhoseUsageIsInConflict(): void {
	const cost = sessionHistoryAttemptCost({
		rates,
		reportedCostUsd: 1.008294,
		series: sessionHistoryRequestSeries({
			prefixLinesExcluded: 0,
			transcript: conflictingPriceTranscript,
		}),
	});

	expect(cost.calculated).toEqual({
		costUsd: 1.009051,
		pricedRequestCount: 1,
		reasons: ["usage is in conflict"],
		requestCount: 2,
		state: "incomplete",
	});
	expect(cost.difference).toEqual({
		costUsd: RECORDED_PROVIDER_COST_USD - EXPECTED_REQUEST_COST_USD,
		pricedRequestCount: 1,
		reasons: [
			"a reading it is drawn from is incomplete",
			"usage is in conflict",
		],
		requestCount: 2,
		state: "incomplete",
	});
}

function refusesToPriceARequestWhoseRowsNeverSettled(): void {
	const transcript = row({
		message: {
			model: "claude-sonnet-5",
			stop_reason: null,
			usage: {
				cache_creation: {
					ephemeral_1h_input_tokens: 0,
					ephemeral_5m_input_tokens: 0,
				},
				cache_creation_input_tokens: 0,
				cache_read_input_tokens: 0,
				input_tokens: 2,
				output_tokens: 8,
			},
		},
		requestId: "req-streaming",
		type: "assistant",
	});

	const cost = sessionHistoryAttemptCost({
		rates,
		reportedCostUsd: undefined,
		series: sessionHistoryRequestSeries({
			prefixLinesExcluded: 0,
			transcript,
		}),
	});

	expect(cost.calculated).toEqual({
		costUsd: 0,
		pricedRequestCount: 0,
		reasons: [
			"usage is incomplete: no row of the request carries a stop reason",
		],
		requestCount: 1,
		state: "incomplete",
	});
}

describe(sessionHistoryAttemptCost.name, () => {
	it(
		"reports provider, calculated and difference as three readings",
		reportsProviderCalculatedAndDifferenceAsThreeReadings,
	);
	it(
		"prices a zero-usage row at zero without a catalogued rate",
		pricesAZeroUsageRowAtZeroWithoutACataloguedRate,
	);
	it(
		"prices only the attempt region, leaving inherited requests out",
		pricesOnlyTheAttemptRegionLeavingInheritedRequestsOut,
	);
	it(
		"refuses to price a request whose usage is in conflict",
		refusesToPriceARequestWhoseUsageIsInConflict,
	);
	it(
		"refuses to price a request whose rows never settled",
		refusesToPriceARequestWhoseRowsNeverSettled,
	);
});
