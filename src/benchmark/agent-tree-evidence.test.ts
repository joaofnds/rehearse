import { describe, expect, it } from "bun:test";

import agentTree from "#benchmark/agent-tree";

import { fixtureInput, withMeta } from "./agent-tree-test-fixtures";

async function showsEachAgentSLaunchModeAndSpawnDepthAsRecorded(): Promise<void> {
	const tree = agentTree(await fixtureInput());

	expect(
		Object.fromEntries(
			tree.agents
				.filter((agent) => agent.evidence === "available")
				.map(({ agentId, launchMode, spawnDepth, description }) => [
					agentId,
					{ description, launchMode, spawnDepth },
				]),
		),
	).toEqual({
		a0: {
			description: "Earlier review",
			launchMode: "foreground",
			spawnDepth: 1,
		},
		a1: {
			description: "Review the code",
			launchMode: "foreground",
			spawnDepth: 1,
		},
		a2: {
			description: "Review the docs",
			launchMode: "background",
			spawnDepth: 1,
		},
		a3: {
			description: "Find the docs",
			launchMode: "foreground",
			spawnDepth: 2,
		},
		a5: { description: undefined, launchMode: "foreground", spawnDepth: 1 },
	});
}

async function marksTheStoppedAgentStoppedAndNoOther(): Promise<void> {
	const tree = agentTree(await fixtureInput());

	expect(
		tree.agents
			.filter(
				(agent) => agent.evidence === "available" && agent.stopped === true,
			)
			.map(({ agentId }) => agentId),
	).toEqual(["a1"]);
}

async function carriesEachReviewAgentSTypeAndNoHarnessRole(): Promise<void> {
	const tree = agentTree(await fixtureInput());

	const reviewers = tree.agents.filter(
		(agent) => agent.evidence === "available" && agent.agentType === "reviewer",
	);

	expect(reviewers.map(({ agentId }) => agentId)).toEqual(["a0", "a1", "a2"]);
	expect(reviewers.every((agent) => !("role" in agent))).toBe(true);
}

async function readsCoverageIncompleteForAnAttemptAgentWithNoTranscript(): Promise<void> {
	const tree = agentTree(await fixtureInput());

	expect(tree.coverage).toEqual({
		state: "incomplete",
		unavailableAgentIds: ["a4"],
	});
}

async function readsWhetherItWasStoppedAsNotRecordedWhenTheFileIsMissing(): Promise<void> {
	const tree = agentTree(await fixtureInput({ subagents: withMeta() }));

	expect(tree.agents.find(({ agentId }) => agentId === "a1")).toMatchObject({
		meta: "not recorded",
		stopped: "not recorded",
	});
}

async function readsTheFileAsUnreadableRatherThanAbsentWhenItDoesNotParse(): Promise<void> {
	const tree = agentTree(
		await fixtureInput({
			subagents: withMeta(
				'{"agentType":"reviewer","spawnDepth":1.5,"stoppedByUser":true}',
			),
		}),
	);

	expect(tree.agents.find(({ agentId }) => agentId === "a1")).toMatchObject({
		meta: "unreadable",
		stopped: "not recorded",
	});
}

describe(agentTree.name, () => {
	it(
		"shows each agent's launch mode and spawn depth as recorded",
		showsEachAgentSLaunchModeAndSpawnDepthAsRecorded,
	);
	it(
		"marks the stopped agent stopped and no other",
		marksTheStoppedAgentStoppedAndNoOther,
	);
	it(
		"carries each review agent's type and no harness role",
		carriesEachReviewAgentSTypeAndNoHarnessRole,
	);
	it(
		"reads coverage incomplete for an attempt agent with no transcript",
		readsCoverageIncompleteForAnAttemptAgentWithNoTranscript,
	);
	describe("when an agent's meta file is missing or unreadable", () => {
		it(
			"reads whether it was stopped as not recorded when the file is missing",
			readsWhetherItWasStoppedAsNotRecordedWhenTheFileIsMissing,
		);

		it(
			"reads the file as unreadable rather than absent when it does not parse",
			readsTheFileAsUnreadableRatherThanAbsentWhenItDoesNotParse,
		);
	});
});
