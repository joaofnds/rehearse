import { describe, expect, it } from "bun:test";

import agentCostAllocation from "#benchmark/agent-cost";
import { UNPRICED_REASONS } from "#benchmark/context-evidence-contract";

import {
	agent,
	available,
	fixtureAllocation,
	modelUsage,
	reasonsOf,
	sonnetOnly,
} from "./agent-cost-test-fixtures";

const INITIAL_PROVIDER_USAGE_COST_USD = 0.03;

async function marksMissingRateIncomplete(): Promise<void> {
	const allocation = await fixtureAllocation({ rates: sonnetOnly });

	const { cost } = agent(allocation, "a2").own;

	expect(cost.state).toBe("incomplete");
	expect(reasonsOf(cost)).toContain(UNPRICED_REASONS["rates-missing"]);
}

async function retainsProviderCostWithoutRate(): Promise<void> {
	const allocation = available(
		await fixtureAllocation({
			modelUsage: {
				"claude-opus-5": modelUsage(INITIAL_PROVIDER_USAGE_COST_USD),
			},
			rates: sonnetOnly,
		}),
	);

	const opus = allocation.byModel.find(
		({ model }) => model === "claude-opus-5",
	);

	expect(opus?.reported).toEqual({ costUsd: 0.03, state: "complete" });
	expect(opus?.calculated.state).toBe("incomplete");
	expect(opus && reasonsOf(opus.calculated)).toContain(
		UNPRICED_REASONS["rates-missing"],
	);
}

async function marksMissingTranscriptIncomplete(): Promise<void> {
	const allocation = available(await fixtureAllocation());

	expect(allocation.calculated.state).toBe("incomplete");
	expect(reasonsOf(allocation.calculated)).toContain(
		"no transcript was kept for sub-agent a4",
	);
}

async function countsRequestsWithMissingTranscript(): Promise<void> {
	const allocation = available(await fixtureAllocation());

	expect(allocation.calculated).toMatchObject({
		pricedRequestCount: 12,
		requestCount: 13,
	});
}

async function marksParentTotalIncomplete(): Promise<void> {
	const allocation = available(await fixtureAllocation());

	const { cost } = allocation.root.includingDescendants;

	expect(cost.state).toBe("incomplete");
	expect(reasonsOf(cost)).toContain("no transcript was kept for sub-agent a4");
}

async function marksModelCostsIncomplete(): Promise<void> {
	const allocation = available(await fixtureAllocation());

	expect(
		allocation.byModel.map(({ model, calculated }) => [
			model,
			calculated.state,
		]),
	).toEqual([
		["claude-opus-5", "incomplete"],
		["claude-sonnet-5", "incomplete"],
	]);
}

async function keepsProviderCountsUnseparated(): Promise<void> {
	const allocation = await fixtureAllocation({
		modelUsage: {
			"claude-opus-5": modelUsage(INITIAL_PROVIDER_USAGE_COST_USD),
		},
	});

	expect(agent(allocation, "a2").provider.state).toBe("not separable");
}

async function refusesUnknownAttemptBoundary(): Promise<void> {
	const allocation = await fixtureAllocation({
		prefixLinesExcluded: undefined,
	});

	expect(allocation).toEqual({
		reasons: ["the transcript carries no attempt boundary"],
		state: "unavailable",
	});
}

describe(agentCostAllocation.name, () => {
	describe("when a child's model has no catalogued rate", () => {
		it(
			"reads the child's calculated cost incomplete for the missing rate",
			marksMissingRateIncomplete,
		);
		it(
			"still shows the provider's cost for that model",
			retainsProviderCostWithoutRate,
		);
	});
	describe("when an attempt agent left no transcript", () => {
		it("reads the attempt total incomplete", marksMissingTranscriptIncomplete);
		it(
			"counts every attempt request in the incomplete total",
			countsRequestsWithMissingTranscript,
		);
		it(
			"reads its parent's total including descendants incomplete",
			marksParentTotalIncomplete,
		);
		it(
			"reads every model's calculated cost incomplete",
			marksModelCostsIncomplete,
		);
		it(
			"separates no agent's provider count, since a4's model is unknown",
			keepsProviderCountsUnseparated,
		);
	});
	describe("when the attempt's boundary is unknown", () => {
		it("allocates nothing", refusesUnknownAttemptBoundary);
	});
});
