import { describe, expect, it } from "bun:test";

import agentTree from "#benchmark/agent-tree";

import { fixtureInput } from "./agent-tree-test-fixtures";

async function readsEachAgentSModelsFromItsOwnRequests(): Promise<void> {
	const tree = agentTree(await fixtureInput());

	expect(
		Object.fromEntries(
			tree.agents
				.filter((agent) => agent.evidence === "available")
				.map(({ agentId, models }) => [agentId, models]),
		),
	).toEqual({
		a0: ["claude-opus-5"],
		a1: ["claude-sonnet-5"],
		a2: ["claude-opus-5"],
		a3: ["claude-sonnet-5"],
		a5: ["claude-sonnet-5"],
	});
}

async function keepsEveryChildSRequestsOutOfTheRootSSeries(): Promise<void> {
	const tree = agentTree(await fixtureInput());

	expect(tree.root.series.entries.map(({ requestId }) => requestId)).toEqual([
		"req-p1",
		"req-r1",
		"req-r2",
		"req-r2b",
		"req-r3",
		"req-r4",
		"req-r5",
	]);
}

async function givesEachAgentTheSeriesOfItsOwnTranscript(): Promise<void> {
	const tree = agentTree(await fixtureInput());

	expect(
		Object.fromEntries(
			tree.agents
				.filter((agent) => agent.evidence === "available")
				.map(({ agentId, series }) => [
					agentId,
					series.entries.map(({ requestId }) => requestId),
				]),
		),
	).toEqual({
		a0: ["req-a0-1", "req-a0-2", "req-a0-3"],
		a1: ["req-a1-1", "req-a1-2"],
		a2: ["req-a2-1", "req-a2-2", "req-a2-3"],
		a3: ["req-a3-1"],
		a5: ["req-a5-1"],
	});
}

async function keepsEachCompactionOnTheAgentWhoseTranscriptRecordedIt(): Promise<void> {
	const tree = agentTree(await fixtureInput());

	expect(
		Object.fromEntries(
			tree.agents
				.filter((agent) => agent.evidence === "available")
				.map(({ agentId, series }) => [agentId, series.compactions]),
		),
	).toEqual({
		a0: [],
		a1: [],
		a2: [{ line: 4, region: "attempt", trigger: "auto" }],
		a3: [],
		a5: [],
	});
	expect(tree.root.series.compactions).toEqual([]);
}

async function listsTheSourcesEachAgentReceivedInItsOwnTranscript(): Promise<void> {
	const tree = agentTree(await fixtureInput());

	expect(
		Object.fromEntries(
			tree.agents
				.filter((agent) => agent.evidence === "available")
				.map(({ agentId, deliveries }) => [
					agentId,
					deliveries.map(({ name, observedDeliveryCount }) => ({
						name,
						observedDeliveryCount,
					})),
				]),
		),
	).toEqual({
		a0: [{ name: "CLAUDE.md", observedDeliveryCount: 1 }],
		a1: [{ name: "CLAUDE.md", observedDeliveryCount: 1 }],
		a2: [{ name: "CLAUDE.md", observedDeliveryCount: 1 }],
		a3: [],
		a5: [],
	});
}

async function listsEachDeliveryAnAgentReceivedWithItsOwnEventAndSize(): Promise<void> {
	const tree = agentTree(await fixtureInput());

	expect(tree.agents.find(({ agentId }) => agentId === "a1")).toMatchObject({
		deliveryEvents: [
			{
				eventId: "4:1",
				measurement: { state: "complete" },
				ordinal: 1,
				sourceId: "project:CLAUDE.md",
			},
		],
	});
	expect(
		tree.root.deliveryEvents.map(({ sourceId, ordinal }) => ({
			ordinal,
			sourceId,
		})),
	).toEqual([
		{ ordinal: 1, sourceId: "skill:skills/review/SKILL.md" },
		{ ordinal: 1, sourceId: "skill:skills/review-docs/SKILL.md" },
		{ ordinal: 1, sourceId: "skill:skills/verify/SKILL.md" },
	]);
}

async function listsTheRootSOwnDeliveriesAndNoneOfItsChildrenS(): Promise<void> {
	const tree = agentTree(await fixtureInput());

	expect(tree.root.deliveries.map(({ name }) => name)).toEqual([
		"skills/review/SKILL.md",
		"skills/review-docs/SKILL.md",
		"skills/verify/SKILL.md",
	]);
}

async function readsAStreamedChildRequestCompleteFromItsFinalRows(): Promise<void> {
	const tree = agentTree(await fixtureInput());

	const a1 = tree.agents.find(({ agentId }) => agentId === "a1");
	const a2 = tree.agents.find(({ agentId }) => agentId === "a2");

	expect(
		a1?.evidence === "available" &&
			a1.series.entries.map(({ usageState }) => usageState),
	).toEqual(["complete", "complete"]);
	expect(
		a2?.evidence === "available" &&
			a2.series.entries.map(({ usageState }) => usageState),
	).toEqual(["complete", "complete", "incomplete"]);
}

describe(agentTree.name, () => {
	it(
		"reads each agent's models from its own requests",
		readsEachAgentSModelsFromItsOwnRequests,
	);
	it(
		"keeps every child's requests out of the root's series",
		keepsEveryChildSRequestsOutOfTheRootSSeries,
	);
	it(
		"gives each agent the series of its own transcript",
		givesEachAgentTheSeriesOfItsOwnTranscript,
	);
	it(
		"keeps each compaction on the agent whose transcript recorded it",
		keepsEachCompactionOnTheAgentWhoseTranscriptRecordedIt,
	);
	it(
		"lists the sources each agent received in its own transcript",
		listsTheSourcesEachAgentReceivedInItsOwnTranscript,
	);
	it(
		"lists each delivery an agent received with its own event and size",
		listsEachDeliveryAnAgentReceivedWithItsOwnEventAndSize,
	);
	it(
		"lists the root's own deliveries and none of its children's",
		listsTheRootSOwnDeliveriesAndNoneOfItsChildrenS,
	);
	it(
		"reads a streamed child request complete from its final rows",
		readsAStreamedChildRequestCompleteFromItsFinalRows,
	);
});
