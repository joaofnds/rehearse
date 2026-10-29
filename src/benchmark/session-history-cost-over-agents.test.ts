import { describe, expect, it } from "bun:test";

import type { SessionHistoryAttemptCost } from "#benchmark/session-history";
import {
	attemptCostOverAgents,
	sessionHistoryAttemptCost,
} from "#benchmark/session-history";

import {
	INHERITED_REQUEST_PREFIX_LINES,
	rates,
	seriesWith,
} from "./session-history-pricing-test-fixtures";

const PROVIDER_COST_USD = 2.5;

const EVERY_AGENT_COST_USD = 2;

const EXPECTED_DIFFERENCE_USD = 0.5;

const NO_DIFFERENCE_USD = 0;

const NOISE_CASES = [
	{
		calculatedCostUsd: 3.2174297999999997,
		reportedCostUsd: 3.2174297999999992,
		side: "below",
	},
	{
		calculatedCostUsd: 2.9356322,
		reportedCostUsd: 2.9356322000000006,
		side: "above",
	},
];

function rootCostReporting(reportedCostUsd: number): SessionHistoryAttemptCost {
	return sessionHistoryAttemptCost({
		rates,
		reportedCostUsd,
		series: seriesWith(INHERITED_REQUEST_PREFIX_LINES),
	});
}

function drawsTheDifferenceFromTheCalculatedReadingOverEveryAgent(): void {
	const cost = attemptCostOverAgents(rootCostReporting(PROVIDER_COST_USD), {
		costUsd: EVERY_AGENT_COST_USD,
		state: "complete",
	});

	expect(cost.difference).toEqual({
		costUsd: EXPECTED_DIFFERENCE_USD,
		state: "complete",
	});
}

function keepsTheRootRequestsReadingBesideIt(): void {
	const root = rootCostReporting(PROVIDER_COST_USD);

	const cost = attemptCostOverAgents(root, {
		costUsd: EVERY_AGENT_COST_USD,
		state: "complete",
	});

	expect(cost.rootRequests).toEqual(root.calculated);
}

function readsAnExactZero({
	calculatedCostUsd,
	reportedCostUsd,
}: Readonly<(typeof NOISE_CASES)[number]>): void {
	const cost = attemptCostOverAgents(rootCostReporting(reportedCostUsd), {
		costUsd: calculatedCostUsd,
		state: "complete",
	});

	expect(cost.difference.state === "complete" && cost.difference.costUsd).toBe(
		NO_DIFFERENCE_USD,
	);
}

describe(attemptCostOverAgents.name, () => {
	it(
		"draws the difference from the calculated reading over every agent",
		drawsTheDifferenceFromTheCalculatedReadingOverEveryAgent,
	);

	it(
		"keeps the root requests' reading beside it",
		keepsTheRootRequestsReadingBesideIt,
	);

	describe("when the two readings differ only by float noise", () => {
		it.each(NOISE_CASES)(
			"reads an exact zero when the provider figure sits $side the calculated one",
			readsAnExactZero,
		);
	});
});
