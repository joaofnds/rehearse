import { availableAgent, readings } from "./agent-context-readings";
import readMeta from "./agent-metadata";
import type { AgentLink, Owner } from "./agent-parent-links";
import {
	ROOT,
	isInherited,
	launchIndex,
	parentFor,
} from "./agent-parent-links";
import type {
	AgentTree,
	AgentTreeInput,
	SubAgent,
	SubagentEvidence,
} from "./agent-tree-contract";
import RESUME_NOT_RECORDED from "./agent-tree-contract";
import type { Immutable } from "./contracts";

const EMPTY_COLLECTION_LENGTH = 0;

/**
 * Projects a session attempt's agents from its own transcript and the
 * sub-agent files its record holds. Every agent a transcript names is in the
 * tree, and one the record holds no transcript for reads as unavailable; it
 * leaves coverage incomplete unless it ran in the inherited prefix, before
 * the attempt.
 */
function agentTree(input: Immutable<AgentTreeInput>): AgentTree {
	const files = new Map(input.subagents.map((each) => [each.agentId, each]));
	const transcripts = new Map<Owner, string>([
		[ROOT, input.transcript],
		...input.subagents.map(
			({ agentId, transcript }) => [agentId, transcript] as const,
		),
	]);
	const index = launchIndex(transcripts);
	const agentIds = [
		...new Set([...files.keys(), ...index.results.keys()]),
	].toSorted();
	const links = new Map(
		agentIds.map((agentId) => [
			agentId,
			parentFor(agentId, readMeta(files.get(agentId)?.meta), index),
		]),
	);

	const agents = agentIds.map((agentId) =>
		projectAgent(input, { agentId, files, links }),
	);
	const unavailableAgentIds = agents
		.filter(
			(agent) =>
				agent.evidence === "unavailable" && agent.context !== "inherited",
		)
		.map(({ agentId }) => agentId);

	return {
		agents,
		coverage:
			unavailableAgentIds.length === EMPTY_COLLECTION_LENGTH
				? { state: "complete" }
				: { state: "incomplete", unavailableAgentIds },
		root: readings(input, input.transcript, {
			inherited: false,
			prefixLinesExcluded: input.prefixLinesExcluded,
		}),
	};
}

interface AgentProjectionContext {
	readonly agentId: string;
	readonly files: ReadonlyMap<string, Immutable<SubagentEvidence>>;
	readonly links: ReadonlyMap<string, AgentLink>;
}
function projectAgent(
	input: Immutable<AgentTreeInput>,
	{ agentId, files, links }: AgentProjectionContext,
): SubAgent {
	const file = files.get(agentId);
	const link = links.get(agentId) ?? {
		callLine: undefined,
		launch: undefined,
		parent: { state: "unlinked" },
	};
	const inherited = isInherited(agentId, {
		links,
		prefixLinesExcluded: input.prefixLinesExcluded,
	});
	if (file === undefined) {
		return {
			agentId,
			context: inherited ? "inherited" : "not recorded",
			evidence: "unavailable",
			launchCallLine: link.callLine,
			parent: link.parent,
			resume: RESUME_NOT_RECORDED,
		};
	}

	return availableAgent(input, { file, inherited, link });
}
export { agentTree as default };
export type {
	SubagentEvidence,
	AgentTreeInput,
	AgentLinkBasis,
	AgentParent,
	AgentContextKind,
	AgentTurn,
	AgentDelivery,
	RootAgent,
	SubAgent,
	AgentCoverage,
	AgentTree,
} from "./agent-tree-contract";
export type { AgentMetaState } from "./agent-metadata";
