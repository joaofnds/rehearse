import { describe, expect, it } from "bun:test";

import agentTree from "#benchmark/agent-tree";
import type { SubagentEvidence } from "#benchmark/agent-tree";

import {
	LINES_BEFORE_A4_LAUNCH,
	PREFIX_START_INDEX,
	fixtureInput,
} from "./agent-tree-test-fixtures";

async function readsTheContextEachAgentBeganWithWhereItIsObserved(): Promise<void> {
	const tree = agentTree(await fixtureInput());

	expect(
		Object.fromEntries(
			tree.agents.map(({ agentId, context }) => [agentId, context]),
		),
	).toEqual({
		a0: "inherited",
		a1: "fresh",
		a2: "fresh",
		a3: "fresh",
		a4: "not recorded",
		a5: "fresh",
		a6: "inherited",
	});
}

async function keepsAnInheritedAgentSRequestsOutOfTheAttemptSTotals(): Promise<void> {
	const tree = agentTree(await fixtureInput());

	const inherited = tree.agents.find(({ agentId }) => agentId === "a0");

	expect(
		inherited?.evidence === "available" && inherited.series.attemptTotals,
	).toMatchObject({
		requestCount: 0,
		state: "complete",
	});
}

async function namesCompactionSummariesAndInterruptionsAndNeverAResume(): Promise<void> {
	const tree = agentTree(await fixtureInput());

	expect(
		Object.fromEntries(
			tree.agents
				.filter((agent) => agent.evidence === "available")
				.map(({ agentId, laterTurns, resume }) => [
					agentId,
					{ laterTurns, resume },
				]),
		),
	).toEqual({
		a0: { laterTurns: [], resume: "not recorded" },
		a1: {
			laterTurns: [{ kind: "interruption", line: 7 }],
			resume: "not recorded",
		},
		a2: {
			laterTurns: [{ kind: "compaction summary", line: 5 }],
			resume: "not recorded",
		},
		a3: { laterTurns: [], resume: "not recorded" },
		a5: { laterTurns: [], resume: "not recorded" },
	});
}

async function keepsCoverageComplete(): Promise<void> {
	const tree = agentTree(
		await fixtureInput({
			subagents: (recorded) =>
				recorded.filter(({ agentId }) => agentId !== "a0"),
			transcript: (lines) =>
				lines.slice(PREFIX_START_INDEX, LINES_BEFORE_A4_LAUNCH),
		}),
	);

	expect(tree.coverage).toEqual({ state: "complete" });
	expect(tree.agents.find(({ agentId }) => agentId === "a0")).toMatchObject({
		context: "inherited",
		evidence: "unavailable",
	});
}

async function readsTheRowAsAToolResultAndNotALaterPrompt(): Promise<void> {
	const child: SubagentEvidence = {
		agentId: "a9",
		meta: "{}",
		transcript: [
			{
				message: { content: "look", role: "user" },
				parentUuid: null,
				type: "user",
			},
			{
				message: {
					content: [{ content: "found", type: "tool_result" }],
					role: "user",
				},
				type: "user",
			},
		]
			.map((row) => JSON.stringify(row))
			.join("\n"),
	};

	const tree = agentTree(
		await fixtureInput({
			subagents: (recorded) => [...recorded, child],
		}),
	);

	expect(tree.agents.find(({ agentId }) => agentId === "a9")).toMatchObject({
		laterTurns: [],
	});
}

async function listsTheRootSDeliveriesWithTheirCountsUnknown(): Promise<void> {
	const tree = agentTree(
		await fixtureInput({ prefixLinesExcluded: undefined }),
	);

	expect(
		tree.root.deliveries.map(({ name, observedDeliveryCount }) => ({
			name,
			observedDeliveryCount,
		})),
	).toContainEqual({
		name: "skills/review/SKILL.md",
		observedDeliveryCount: undefined,
	});
}

async function totalsNoAgentSRequestsIntoTheAttempt(): Promise<void> {
	const tree = agentTree(
		await fixtureInput({ prefixLinesExcluded: undefined }),
	);

	expect(
		tree.agents
			.filter((agent) => agent.evidence === "available")
			.map(({ series }) => [series.boundary, series.attemptTotals.state]),
	).toEqual(Array.from({ length: 5 }, () => ["unknown", "unavailable"]));
}

describe(agentTree.name, () => {
	it(
		"reads the context each agent began with where it is observed",
		readsTheContextEachAgentBeganWithWhereItIsObserved,
	);
	it(
		"keeps an inherited agent's requests out of the attempt's totals",
		keepsAnInheritedAgentSRequestsOutOfTheAttemptSTotals,
	);
	it(
		"names compaction summaries and interruptions and never a resume",
		namesCompactionSummariesAndInterruptionsAndNeverAResume,
	);
	describe("when an inherited agent left no transcript", () => {
		it("keeps coverage complete", keepsCoverageComplete);
	});
	describe("when a child's tool result names no tool call", () => {
		it(
			"reads the row as a tool result and not a later prompt",
			readsTheRowAsAToolResultAndNotALaterPrompt,
		);
	});
	describe("when the attempt's boundary is unknown", () => {
		it(
			"lists the root's deliveries with their counts unknown",
			listsTheRootSDeliveriesWithTheirCountsUnknown,
		);

		it(
			"totals no agent's requests into the attempt",
			totalsNoAgentSRequestsIntoTheAttempt,
		);
	});
});
