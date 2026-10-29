import { readdir } from "node:fs/promises";

import agentCostAllocation from "#benchmark/agent-cost";
import type { AttemptCostAllocation } from "#benchmark/agent-cost";
import agentTree from "#benchmark/agent-tree";
import type { AgentTree, SubagentEvidence } from "#benchmark/agent-tree";
import type { ContextRateCatalog } from "#benchmark/context-evidence-contract";
import {
	attemptCostOverAgents,
	sessionHistoryAttemptCost,
	sessionHistoryDetail,
} from "#benchmark/session-history";
import type {
	SessionHistoryAttemptCost,
	SessionHistoryCostReading,
	SessionHistoryDetail,
	SessionHistoryRequestSeries,
} from "#benchmark/session-history";
import {
	SUBAGENTS_DIRECTORY,
	subagentTranscriptAgentId,
} from "#benchmark/subagent-evidence";
import type { ResolvedAttemptInput } from "#server/history-input-contract";
import { SessionHistoryReaderError } from "#server/history-read-identity";
import { readVerifiedFile } from "#server/history-verified-file";
import {
	verifiedDirectoryWhenPresent,
	verifiedFile,
} from "#server/history-verified-path";

type SessionHistoryAgents =
	| {
			readonly state: "available";
			readonly tree: AgentTree;
			readonly cost: AttemptCostAllocation;
	  }
	| { readonly state: "unavailable"; readonly reason: string };

const TRANSCRIPT_NOT_SAVED = "the attempt has no saved transcript";

const SUBAGENT_FILES_REFUSED = "the attempt's sub-agent files were refused";

/**
 * A child file is read through the same guard as the attempt's own evidence.
 * One the guard refuses, a link or a file swapped while it was checked, stays
 * out of the reading, so its agent reads as unavailable rather than failing
 * every other agent's evidence or following the link out of the record.
 */
async function guardedText(
	root: string,
	directory: string,
	name: string,
): Promise<string | undefined> {
	try {
		const file = await verifiedFile(root, { directory, name, required: false });

		return file === undefined ? undefined : await readVerifiedFile(root, file);
	} catch (error) {
		if (
			error instanceof SessionHistoryReaderError &&
			error.kind === "refused"
		) {
			return undefined;
		}

		throw error;
	}
}

async function verifiedSubagents(
	root: string,
	recordDirectory: string,
): Promise<readonly SubagentEvidence[]> {
	const directory = await verifiedDirectoryWhenPresent(recordDirectory, [
		SUBAGENTS_DIRECTORY,
	]);
	if (directory === undefined) {
		return [];
	}

	const names = await readdir(directory);
	const agentIds = names
		.map((name) => subagentTranscriptAgentId(name))
		.filter((agentId) => agentId !== undefined)
		.toSorted();
	const subagents: SubagentEvidence[] = [];
	await Array.fromAsync(agentIds, async (agentId) => {
		const transcript = await guardedText(
			root,
			directory,
			`agent-${agentId}.jsonl`,
		);
		if (transcript !== undefined) {
			subagents.push({
				agentId,
				meta: await guardedText(root, directory, `agent-${agentId}.meta.json`),
				transcript,
			});
		}
	});

	return subagents;
}

async function agentsFor(
	input: Readonly<ResolvedAttemptInput>,
	rates: ContextRateCatalog,
): Promise<SessionHistoryAgents> {
	if (input.transcriptFile === undefined) {
		return { reason: TRANSCRIPT_NOT_SAVED, state: "unavailable" };
	}

	const transcript = await readVerifiedFile(input.root, input.transcriptFile);
	const subagents = await verifiedSubagents(input.root, input.directory);

	const agentInput = {
		attempt: input.metadata.attempt,
		prefixLinesExcluded: input.metadata.prefixLinesExcluded,
		resolvedCorpusFiles: input.metadata.resolvedCorpusFiles,
		subagents,
		transcript,
	};

	const tree = agentTree(agentInput);

	return {
		cost: agentCostAllocation(
			{ ...agentInput, modelUsage: input.modelUsage, rates },
			tree,
		),
		state: "available",
		tree,
	};
}

function everyAgentCalculated(
	agents: SessionHistoryAgents,
): SessionHistoryCostReading {
	if (agents.state === "unavailable") {
		return { reasons: [agents.reason], state: "unavailable" };
	}

	return agents.cost.state === "unavailable"
		? { reasons: agents.cost.reasons, state: "unavailable" }
		: agents.cost.calculated;
}

/**
 * The provider charges for every agent of the attempt, so its cost is
 * reconciled with the calculated cost of every agent's requests, the root's
 * series kept beside it.
 */
async function attemptCostOverAgentsFor(
	input: Readonly<ResolvedAttemptInput>,
	series: SessionHistoryRequestSeries,
	rates: ContextRateCatalog,
): Promise<SessionHistoryAttemptCost> {
	const rootCost = sessionHistoryAttemptCost({
		rates,
		reportedCostUsd: input.reportedCostUsd,
		series,
	});

	return attemptCostOverAgents(
		rootCost,
		everyAgentCalculated(await agentsOrRefusal(input, rates)),
	);
}

/**
 * The root's request series does not depend on its sub-agents, so a
 * sub-agent file the guard refuses leaves only the attempt's calculated
 * reading unavailable rather than refusing the whole series.
 */
async function agentsOrRefusal(
	input: Readonly<ResolvedAttemptInput>,
	rates: ContextRateCatalog,
): Promise<SessionHistoryAgents> {
	try {
		return await agentsFor(input, rates);
	} catch (error) {
		if (
			error instanceof SessionHistoryReaderError &&
			error.kind === "refused"
		) {
			return { reason: SUBAGENT_FILES_REFUSED, state: "unavailable" };
		}

		throw error;
	}
}

/**
 * One event of a sub-agent's own transcript, so a delivery an agent received
 * opens on the text it received. An agent the record holds no transcript for
 * has no event to open.
 */
async function agentDetailFor(
	input: Readonly<ResolvedAttemptInput>,
	agentId: string,
	eventId: string,
): Promise<SessionHistoryDetail | undefined> {
	const directory = await verifiedDirectoryWhenPresent(input.directory, [
		SUBAGENTS_DIRECTORY,
	]);
	const name = `agent-${agentId}.jsonl`;
	const transcript =
		directory === undefined || subagentTranscriptAgentId(name) === undefined
			? undefined
			: await guardedText(input.root, directory, name);
	if (transcript === undefined) {
		return undefined;
	}

	return sessionHistoryDetail(
		{
			attempt: input.metadata.attempt,
			prefixLinesExcluded: 0,
			resolvedCorpusFiles: input.metadata.resolvedCorpusFiles,
			transcript,
		},
		eventId,
	);
}

export { agentsFor, agentDetailFor, attemptCostOverAgentsFor };
export type { SessionHistoryAgents };
