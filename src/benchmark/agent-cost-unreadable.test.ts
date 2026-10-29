import { describe, expect, it } from "bun:test";

import agentCostAllocation from "#benchmark/agent-cost";
import type { SubagentEvidence } from "#benchmark/agent-tree";

import {
	agent,
	available,
	fixtureAllocation,
	reasonsOf,
	withPrefix,
	withoutA4,
} from "./agent-cost-test-fixtures";

/** The third and last line withPrefix inherits, counted from zero. */
const LAST_PREFIX_LINE_INDEX = 2;

const A1_UNREADABLE = "sub-agent a1's transcript line 1 cannot be read";

function a1Reading(
	rewrite: (lines: readonly string[]) => readonly string[],
): (recorded: readonly SubagentEvidence[]) => readonly SubagentEvidence[] {
	return (recorded) =>
		withoutA4.subagents(recorded).map((each) =>
			each.agentId === "a1"
				? {
						agentId: each.agentId,
						meta: each.meta,
						transcript: rewrite(each.transcript.split("\n")).join("\n"),
					}
				: each,
		);
}

const corruptA1 = {
	...withoutA4,
	subagents: a1Reading(() => ["not json"]),
};

async function marksAttemptTotalIncomplete(): Promise<void> {
	const allocation = available(await fixtureAllocation(corruptA1));

	expect(reasonsOf(allocation.calculated)).toContain(A1_UNREADABLE);
}

async function marksAgentOwnCostIncomplete(): Promise<void> {
	const allocation = await fixtureAllocation(corruptA1);

	const { cost } = agent(allocation, "a1").own;

	expect(reasonsOf(cost)).toEqual([A1_UNREADABLE]);
}

async function marksMistypedRequestIncomplete(): Promise<void> {
	const allocation = await fixtureAllocation({
		...withoutA4,
		subagents: a1Reading((lines) =>
			lines.map((row) =>
				row.includes('"type":"assistant"')
					? row.replaceAll('"input_tokens":3', '"input_tokens":"3"')
					: row,
			),
		),
	});

	const { cost } = agent(allocation, "a1").own;

	expect(cost.state).toBe("incomplete");
}

async function marksModelCostsIncomplete(): Promise<void> {
	const allocation = available(await fixtureAllocation(corruptA1));

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
	const allocation = await fixtureAllocation(corruptA1);

	expect(agent(allocation, "a2").provider.state).toBe("not separable");
}

async function marksRootAttemptLineIncomplete(): Promise<void> {
	const allocation = available(
		await fixtureAllocation({
			...withoutA4,
			transcript: (lines) => [
				...withoutA4.transcript(lines),
				'{"type":"assistant","requestId":"req-cut',
			],
		}),
	);

	expect(reasonsOf(allocation.calculated)).toContain(
		"the attempt transcript's line 17 cannot be read",
	);
}

async function ignoresUnreadablePrefixLine(): Promise<void> {
	const intact = available(await fixtureAllocation(withPrefix));
	const allocation = available(
		await fixtureAllocation({
			...withPrefix,
			transcript: (lines) =>
				withPrefix.transcript(lines).with(LAST_PREFIX_LINE_INDEX, "not json"),
		}),
	);

	expect(allocation.calculated).toEqual(intact.calculated);
}

async function readsRequestlessTranscriptComplete(): Promise<void> {
	const allocation = await fixtureAllocation({
		...withoutA4,
		subagents: a1Reading((lines) =>
			lines.filter((row) => !row.includes('"type":"assistant"')),
		),
	});

	expect(agent(allocation, "a1").own.cost).toEqual({
		costUsd: 0,
		state: "complete",
	});
}

describe(agentCostAllocation.name, () => {
	describe("when a kept sub-agent transcript holds an unreadable line", () => {
		it(
			"reads the attempt total incomplete, naming the agent and line",
			marksAttemptTotalIncomplete,
		);
		it("reads that agent's own cost incomplete", marksAgentOwnCostIncomplete);
		it(
			"reads every model's calculated cost incomplete",
			marksModelCostsIncomplete,
		);
		it(
			"separates no agent's provider count, since the line's model is unknown",
			keepsProviderCountsUnseparated,
		);
	});
	describe("when an assistant row's usage has the wrong type", () => {
		it(
			"reads that agent's own cost incomplete",
			marksMistypedRequestIncomplete,
		);
	});
	describe("when the root transcript holds an unreadable line", () => {
		it(
			"reads the attempt total incomplete in the attempt region",
			marksRootAttemptLineIncomplete,
		);
		it(
			"leaves the total complete in the inherited prefix",
			ignoresUnreadablePrefixLine,
		);
	});
	describe("when a kept sub-agent transcript holds no request", () => {
		it(
			"reads that agent's own cost complete at zero",
			readsRequestlessTranscriptComplete,
		);
	});
});
