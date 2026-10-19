import { describe, expect, it } from "bun:test";

import { UNPRICED_REASONS } from "#benchmark/context-evidence-contract";
import {
	sessionHistoryAttemptCost,
	sessionHistoryRequestCosts,
} from "#benchmark/session-history";

import {
	INHERITED_REQUEST_PREFIX_LINES,
	NO_PREFIX_LINES,
	bothModels,
	rates,
	seriesWith,
} from "./session-history-pricing-test-fixtures";

const ATTEMPT_INPUT_TOKENS = 2;

const INPUT_USD_PER_MILLION_TOKENS = 3;

const ATTEMPT_OUTPUT_TOKENS = 151;

const OUTPUT_USD_PER_MILLION_TOKENS = 15;

const ATTEMPT_CACHE_WRITE_TOKENS = 251_695;

const CACHE_WRITE_USD_PER_MILLION_TOKENS = 4;

const TOKENS_PER_MILLION = 1_000_000;

const LATER_REQUEST_LINE_NUMBER = 2;

const INITIAL_REQUEST_LINE_NUMBER = 1;

function pricesEachAttemptRegionRequestWithTheReadingTheSumCounts(): void {
	const series = seriesWith(INHERITED_REQUEST_PREFIX_LINES);

	const costs = sessionHistoryRequestCosts(series, bothModels);

	const attemptRequestCost =
		(ATTEMPT_INPUT_TOKENS * INPUT_USD_PER_MILLION_TOKENS +
			ATTEMPT_OUTPUT_TOKENS * OUTPUT_USD_PER_MILLION_TOKENS +
			ATTEMPT_CACHE_WRITE_TOKENS * CACHE_WRITE_USD_PER_MILLION_TOKENS) /
		TOKENS_PER_MILLION;
	expect(costs.get(LATER_REQUEST_LINE_NUMBER)).toEqual({
		costUsd: attemptRequestCost,
		state: "priced",
	});
	expect(
		sessionHistoryAttemptCost({
			rates: bothModels,
			reportedCostUsd: undefined,
			series,
		}).calculated,
	).toEqual({ costUsd: attemptRequestCost, state: "complete" });
}

function namesWhyARequestIsUnpricedRatherThanPricingItAtZero(): void {
	const series = seriesWith(NO_PREFIX_LINES);

	const costs = sessionHistoryRequestCosts(series, rates);

	expect(costs.get(INITIAL_REQUEST_LINE_NUMBER)).toEqual({
		reason: UNPRICED_REASONS["rates-missing"],
		state: "unpriced",
	});
}

function leavesAStartingContextRequestOutOfThePerRequestPricing(): void {
	const series = seriesWith(INHERITED_REQUEST_PREFIX_LINES);

	const costs = sessionHistoryRequestCosts(series, bothModels);

	expect(costs.has(INITIAL_REQUEST_LINE_NUMBER)).toBe(false);
}

describe(sessionHistoryAttemptCost.name, () => {
	it(
		"prices each attempt-region request with the reading the sum counts",
		pricesEachAttemptRegionRequestWithTheReadingTheSumCounts,
	);
	it(
		"names why a request is unpriced rather than pricing it at zero",
		namesWhyARequestIsUnpricedRatherThanPricingItAtZero,
	);
	it(
		"leaves a starting-context request out of the per-request pricing",
		leavesAStartingContextRequestOutOfThePerRequestPricing,
	);
});
