import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import {
	AGENT_TREE_FIXTURE,
	writtenAgentTreeAttempt,
} from "#server/session-history-agents-test-fixture";
import writtenConfirmationAttempt from "#server/session-history-confirmation-test-fixture";
import {
	clearSessionHistoryRoots,
	startHistoryApi,
} from "#server/session-history-workspace-test-fixture";

afterEach(clearSessionHistoryRoots);

describe("/api/attempts/session/:caseId/:uuid/history/agents", () => {
	describe("GET", () => {
		it(
			"serves the agent tree and its cost allocation",
			verifyServesTheAgentTreeAndItsCostAllocation,
		);
	});
});

describe("/api/attempts/session/:caseId/:uuid/history/agents/:agentId/:eventId", () => {
	describe("GET", () => {
		it(
			"serves a child agent's delivered excerpt",
			verifyServesAChildAgentSDeliveredExcerpt,
		);

		it(
			"answers not found for an agent the record holds no transcript for",
			verifyAnswersNotFoundForAnAgentTheRecordHolds,
		);

		it(
			"answers not found for a file whose name is not a provider agent id",
			verifyAnswersNotFoundForAFileWhoseNameIs,
		);
	});
});

describe("/api/groups/:groupId/reps/:repId/attempt/history/agents", () => {
	describe("GET", () => {
		it(
			"reads a confirmation rep's agents and excerpts from the rep's own directory",
			verifyReadsAConfirmationRepSAgentsAndExcerptsFrom,
		);

		it(
			"serves a confirmation rep's agents through its own route",
			verifyServesAConfirmationRepSAgentsThroughItsOwn,
		);
	});
});

async function verifyServesTheAgentTreeAndItsCostAllocation(): Promise<void> {
	const fixture = await writtenAgentTreeAttempt();
	const api = await startHistoryApi(fixture.runsDirectory);

	const response = await api.savedEvidence.sessionAgents(fixture);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toMatchObject({
		cost: { state: "available" },
		state: "available",
		tree: { coverage: { state: "incomplete", unavailableAgentIds: ["a4"] } },
	});
}

async function verifyServesAChildAgentSDeliveredExcerpt(): Promise<void> {
	const fixture = await writtenAgentTreeAttempt();
	const api = await startHistoryApi(fixture.runsDirectory);

	const response = await api.savedEvidence.sessionAgentExcerpt(fixture, {
		agentId: "a1",
		eventId: "4:1",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toMatchObject({
		eventId: "4:1",
		kind: "result",
		state: "delivered",
	});
}

async function verifyAnswersNotFoundForAnAgentTheRecordHolds(): Promise<void> {
	const fixture = await writtenAgentTreeAttempt();
	const api = await startHistoryApi(fixture.runsDirectory);

	const response = await api.savedEvidence.sessionAgentExcerpt(fixture, {
		agentId: "a4",
		eventId: "1:1",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
}

async function verifyAnswersNotFoundForAFileWhoseNameIs(): Promise<void> {
	const fixture = await writtenAgentTreeAttempt();
	await Bun.write(
		join(fixture.directory, "subagents", "agent-a1.x.jsonl"),
		Bun.file(join(AGENT_TREE_FIXTURE, "subagents", "agent-a1.jsonl")),
	);
	const api = await startHistoryApi(fixture.runsDirectory);

	const response = await api.savedEvidence.sessionAgentExcerpt(fixture, {
		agentId: "a1.x",
		eventId: "4:1",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
}

async function verifyReadsAConfirmationRepSAgentsAndExcerptsFrom(): Promise<void> {
	const fixture = await writtenConfirmationAttempt();
	await Array.fromAsync(
		["agent-a1.jsonl", "agent-a1.meta.json"],
		async (name) => {
			await Bun.write(
				join(fixture.paths.rep(fixture.repId).directory, "subagents", name),
				Bun.file(join(AGENT_TREE_FIXTURE, "subagents", name)),
			);
		},
	);
	const api = await startHistoryApi(fixture.runsDirectory);

	const agents = await api.savedEvidence.confirmationAgents(fixture);
	const excerpt = await api.savedEvidence.confirmationAgentExcerpt(fixture, {
		agentId: "a1",
		eventId: "4:1",
	});

	expect(await agents.json()).toMatchObject({
		tree: { agents: [{ agentId: "a1", evidence: "available" }] },
	});
	expect(excerpt.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await excerpt.json()).toMatchObject({
		eventId: "4:1",
		state: "delivered",
	});
}

async function verifyServesAConfirmationRepSAgentsThroughItsOwn(): Promise<void> {
	const fixture = await writtenConfirmationAttempt();
	const api = await startHistoryApi(fixture.runsDirectory);

	const response = await api.savedEvidence.confirmationAgents(fixture);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toMatchObject({
		state: "available",
		tree: { agents: [], coverage: { state: "complete" } },
	});
}
