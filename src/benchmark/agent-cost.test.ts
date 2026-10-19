import { describe, expect, it } from "bun:test";

import agentCostAllocation from "#benchmark/agent-cost";
import agentTree from "#benchmark/agent-tree";
import { committedRateCatalog } from "#benchmark/rate-catalog";
import { sessionHistoryAttemptCost } from "#benchmark/session-history";

import {
	agent,
	available,
	costOf,
	fixtureAllocation,
	fixtureInput,
	partsOf,
	skillNamed,
} from "./agent-cost-test-fixtures";

const NO_SPEND_USD = 0;

const COST_COMPARISON_DECIMAL_PLACES = 10;

async function totalsAllAgentAllocations(): Promise<void> {
	const allocation = available(await fixtureAllocation());

	const parts = [allocation.root, ...allocation.agents].reduce(
		(sum, each) => sum + partsOf(each),
		NO_SPEND_USD,
	);

	expect(costOf(allocation.calculated)).toBeCloseTo(
		parts,
		COST_COMPARISON_DECIMAL_PLACES,
	);
}

async function pricesOnlyAttemptRequests(): Promise<void> {
	const input = await fixtureInput();
	const tree = agentTree(input);
	const oracle = [
		tree.root.series,
		...tree.agents
			.filter((each) => each.evidence === "available")
			.filter((each) => each.context !== "inherited")
			.map(({ series }) => series),
	].reduce(
		(sum, series) =>
			sum +
			costOf(
				sessionHistoryAttemptCost({
					rates: committedRateCatalog,
					reportedCostUsd: undefined,
					series,
				}).calculated,
			),
		NO_SPEND_USD,
	);

	const allocation = available(await fixtureAllocation());

	expect(allocation.agents.map(({ agentId }) => agentId)).toEqual([
		"a1",
		"a2",
		"a3",
		"a5",
	]);
	expect(costOf(allocation.calculated)).toBeCloseTo(
		oracle,
		COST_COMPARISON_DECIMAL_PLACES,
	);
}

async function totalsOwnAgentCosts(): Promise<void> {
	const allocation = available(await fixtureAllocation());

	const owns = [allocation.root, ...allocation.agents].reduce(
		(sum, each) => sum + costOf(each.own.cost),
		NO_SPEND_USD,
	);

	expect(costOf(allocation.calculated)).toBeCloseTo(
		owns,
		COST_COMPARISON_DECIMAL_PLACES,
	);
}

async function chargesSkillWindowRequests(): Promise<void> {
	const firstReviewRequestLine = 8;
	const lastReviewRequestLine = 12;

	const allocation = available(await fixtureAllocation());

	expect(skillNamed(allocation.root, "review").own.requestLines).toEqual([
		firstReviewRequestLine,
		lastReviewRequestLine,
	]);
}

async function includesSkillDescendants(): Promise<void> {
	const comparisonDecimalPlaces = 10;

	const allocation = await fixtureAllocation();

	const review = skillNamed(available(allocation).root, "review");

	expect(review.includingDescendants.childAgentIds).toEqual(["a1", "a2"]);
	expect(costOf(review.includingDescendants.cost)).toBeCloseTo(
		costOf(review.own.cost) +
			costOf(agent(allocation, "a1").includingDescendants.cost) +
			costOf(agent(allocation, "a2").includingDescendants.cost),
		comparisonDecimalPlaces,
	);
}

async function includesAgentDescendants(): Promise<void> {
	const comparisonDecimalPlaces = 10;

	const allocation = await fixtureAllocation();

	const a2 = agent(allocation, "a2");

	expect(a2.includingDescendants.childAgentIds).toEqual(["a3"]);
	expect(costOf(a2.includingDescendants.cost)).toBeCloseTo(
		costOf(a2.own.cost) +
			costOf(agent(allocation, "a3").includingDescendants.cost),
		comparisonDecimalPlaces,
	);
}

async function labelsAllocationBases(): Promise<void> {
	const allocation = available(await fixtureAllocation());

	const review = skillNamed(allocation.root, "review");

	expect({
		includingDescendants: review.includingDescendants.basis,
		shared: allocation.root.shared.basis,
		skill: review.own.basis,
		unattributed: allocation.root.unattributed.basis,
	}).toEqual({
		includingDescendants:
			"own cost plus each descendant's total; never added into the attempt total",
		shared:
			"requests after one request delivered more than one skill; not split between them",
		skill:
			"from the skill's delivery until the next skill delivery, user prompt or interruption, or the transcript's end; the transcript records no skill end.",
		unattributed: "requests outside every skill window",
	});
}

async function keepsMultiSkillRequestsShared(): Promise<void> {
	const firstSharedRequestLine = 18;
	const middleSharedRequestLine = 20;
	const lastSharedRequestLine = 22;

	const allocation = available(await fixtureAllocation());

	expect({
		lines: allocation.root.shared.requestLines,
		skills: allocation.root.shared.skills,
	}).toEqual({
		lines: [
			firstSharedRequestLine,
			middleSharedRequestLine,
			lastSharedRequestLine,
		],
		skills: ["review-docs", "verify"],
	});
}

async function keepsUnscopedRequestsUnattributed(): Promise<void> {
	const firstUnattributedChildRequestLine = 2;
	const lastUnattributedChildRequestLine = 5;
	const unattributedRootRequestLine = 5;

	const allocation = await fixtureAllocation();

	expect({
		a1: agent(allocation, "a1").unattributed.requestLines,
		root: available(allocation).root.unattributed.requestLines,
	}).toEqual({
		a1: [firstUnattributedChildRequestLine, lastUnattributedChildRequestLine],
		root: [unattributedRootRequestLine],
	});
}

async function identifiesForkedSkill(): Promise<void> {
	const allocation = await fixtureAllocation();

	expect(agent(allocation, "a5").forkedSkill).toBe("code-review");
}

describe(agentCostAllocation.name, () => {
	it(
		"totals the attempt as every agent's skills, shared and unattributed costs",
		totalsAllAgentAllocations,
	);
	it(
		"prices each attempt request once and none from the inherited prefix",
		pricesOnlyAttemptRequests,
	);
	it("totals the attempt from own costs only", totalsOwnAgentCosts);
	it(
		"charges a skill the requests that start inside its window",
		chargesSkillWindowRequests,
	);
	it(
		"gives a skill its own cost plus its sub-agents' totals",
		includesSkillDescendants,
	);
	it(
		"gives a sub-agent its own cost plus its descendants' totals",
		includesAgentDescendants,
	);
	it(
		"labels each reading with the basis of its allocation",
		labelsAllocationBases,
	);
	it(
		"charges requests after a request that delivered two skills to the shared remainder",
		keepsMultiSkillRequestsShared,
	);
	it(
		"leaves requests outside every skill window unattributed",
		keepsUnscopedRequestsUnattributed,
	);
	it("shows a forked skill as its agent", identifiesForkedSkill);
});
