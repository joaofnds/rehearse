import { afterEach, describe, expect, it } from "bun:test";
import { rm, symlink } from "node:fs/promises";
import { join } from "node:path";

import { committedRateCatalog } from "#benchmark/rate-catalog";
import {
	AGENT_TREE_FIXTURE,
	writtenAgentTreeAttempt,
} from "#server/session-history-agents-test-fixture";
import { readSessionAttemptAgents } from "#server/session-history-reader";
import { clearSessionHistoryRoots } from "#server/session-history-workspace-test-fixture";

afterEach(clearSessionHistoryRoots);

describe(readSessionAttemptAgents.name, () => {
	describe("when child transcripts are saved", () => {
		it(
			"projects the recorded agents and allocates their cost",
			verifyProjectsTheRecordedAgentsAndAllocatesTheirCost,
		);
	});

	describe("when a child transcript is a symlink", () => {
		it(
			"reads a symlinked child transcript as unavailable rather than following it",
			verifyReadsASymlinkedChildTranscriptAsUnavailableRatherThan,
		);
	});

	describe("when the attempt saved no transcript", () => {
		it(
			"reads no agents for an attempt that saved no transcript",
			verifyReadsNoAgentsForAnAttemptThatSavedNo,
		);
	});
});

async function verifyProjectsTheRecordedAgentsAndAllocatesTheirCost(): Promise<void> {
	const fixture = await writtenAgentTreeAttempt();

	const read = await readSessionAttemptAgents(fixture, committedRateCatalog);

	expect(read).toMatchObject({
		cost: { state: "available" },
		state: "available",
		tree: {
			agents: [
				{ agentId: "a0" },
				{ agentId: "a1" },
				{ agentId: "a2" },
				{ agentId: "a3" },
				{ agentId: "a4" },
				{ agentId: "a5" },
				{ agentId: "a6" },
			],
		},
	});
	expect(read).toHaveProperty("tree.coverage", {
		state: "incomplete",
		unavailableAgentIds: ["a4"],
	});
}

async function verifyReadsASymlinkedChildTranscriptAsUnavailableRatherThan(): Promise<void> {
	const fixture = await writtenAgentTreeAttempt();
	const outside = join(fixture.directory, "..", "outside.jsonl");
	await Bun.write(
		outside,
		Bun.file(join(AGENT_TREE_FIXTURE, "subagents", "agent-a1.jsonl")),
	);
	await rm(join(fixture.directory, "subagents", "agent-a1.jsonl"));
	await symlink(
		outside,
		join(fixture.directory, "subagents", "agent-a1.jsonl"),
	);

	const read = await readSessionAttemptAgents(fixture, committedRateCatalog);

	expect(read).toMatchObject({ state: "available" });
	expect(read).toHaveProperty("tree.coverage", {
		state: "incomplete",
		unavailableAgentIds: ["a1", "a4"],
	});
}

async function verifyReadsNoAgentsForAnAttemptThatSavedNo(): Promise<void> {
	const fixture = await writtenAgentTreeAttempt();
	await rm(join(fixture.directory, "transcript.jsonl"));

	expect(await readSessionAttemptAgents(fixture, committedRateCatalog)).toEqual(
		{
			reason: "the attempt has no saved transcript",
			state: "unavailable",
		},
	);
}
