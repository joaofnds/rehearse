import { describe, expect, it } from "bun:test";

import agentTree from "#benchmark/agent-tree";

import { fixtureInput, stray } from "./agent-tree-test-fixtures";

async function linksEachAgentToTheAgentOrRootThatLaunchedIt(): Promise<void> {
	const tree = agentTree(await fixtureInput());

	expect(
		Object.fromEntries(
			tree.agents.map(({ agentId, parent }) => [agentId, parent]),
		),
	).toEqual({
		a0: { basis: "launch call", state: "root" },
		a1: { basis: "launch call", state: "root" },
		a2: { basis: "launch call", state: "root" },
		a3: { agentId: "a2", basis: "parent agent id", state: "agent" },
		a4: { basis: "agent result", state: "root" },
		a5: { basis: "skill result", state: "root" },
		a6: { agentId: "a0", basis: "agent result", state: "agent" },
	});
}

async function recordsTheLineOfTheParentSCallThatLaunchedEachAgent(): Promise<void> {
	const tree = agentTree(await fixtureInput());

	expect(
		Object.fromEntries(
			tree.agents.map(({ agentId, launchCallLine }) => [
				agentId,
				launchCallLine,
			]),
		),
	).toEqual({ a0: 2, a1: 8, a2: 9, a3: 2, a4: 20, a5: 18, a6: 4 });
}

async function recordsNoLaunchingLineForTheAgent(): Promise<void> {
	const tree = agentTree(
		await fixtureInput({
			subagents: (recorded) =>
				recorded.map((each) =>
					each.agentId === "a3"
						? {
								agentId: each.agentId,
								meta: JSON.stringify({ parentAgentId: "a1" }),
								transcript: each.transcript,
							}
						: each,
				),
		}),
	);

	expect(
		tree.agents.find(({ agentId }) => agentId === "a3")?.launchCallLine,
	).toBeUndefined();
}

async function leavesItUnlinkedRatherThanGuessingAParent(): Promise<void> {
	const tree = agentTree(
		await fixtureInput({
			subagents: (recorded) => [...recorded, stray],
		}),
	);

	expect(tree.agents.find(({ agentId }) => agentId === "a9")?.parent).toEqual({
		state: "unlinked",
	});
}

async function readsItsStartingContextAsNotRecorded(): Promise<void> {
	const tree = agentTree(
		await fixtureInput({
			subagents: (recorded) => [...recorded, stray],
		}),
	);

	expect(tree.agents.find(({ agentId }) => agentId === "a9")?.context).toBe(
		"not recorded",
	);
}

describe(agentTree.name, () => {
	it(
		"links each agent to the agent or root that launched it",
		linksEachAgentToTheAgentOrRootThatLaunchedIt,
	);
	it(
		"records the line of the parent's call that launched each agent",
		recordsTheLineOfTheParentSCallThatLaunchedEachAgent,
	);
	describe("when a meta file names a parent that did not make the launching call", () => {
		it(
			"records no launching line for the agent",
			recordsNoLaunchingLineForTheAgent,
		);
	});
	describe("when a kept agent names no launch and continues a conversation", () => {
		it(
			"leaves it unlinked rather than guessing a parent",
			leavesItUnlinkedRatherThanGuessingAParent,
		);

		it(
			"reads its starting context as not recorded",
			readsItsStartingContextAsNotRecorded,
		);
	});
});
