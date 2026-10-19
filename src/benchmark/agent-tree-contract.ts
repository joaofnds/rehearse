import type { AgentMetaState } from "./agent-metadata";
import type {
	CorpusFileLocation,
	SessionHistoryAttemptIdentity,
	SessionHistoryRequestSeries,
	SessionHistorySource,
	TextMeasurement,
} from "./session-history";
import type { UserTurn } from "./transcript";

/** One sub-agent's files as the record holds them. */
interface SubagentEvidence {
	readonly agentId: string;
	readonly transcript: string;
	/** Absent when the record holds no meta file for the agent. */
	readonly meta: string | undefined;
}

interface AgentTreeInput {
	readonly attempt: SessionHistoryAttemptIdentity;
	readonly resolvedCorpusFiles: readonly CorpusFileLocation[];
	readonly transcript: string;
	readonly prefixLinesExcluded: number | undefined;
	readonly subagents: readonly SubagentEvidence[];
}

/**
 * What tied an agent to its parent: the meta file's link to the launching
 * tool call, the meta file's parent agent id, or, where the meta file carries
 * neither, the parent's Agent or forked Skill result naming the agent.
 */
type AgentLinkBasis =
	| "launch call"
	| "parent agent id"
	| "agent result"
	| "skill result";

type AgentParent =
	| { readonly state: "root"; readonly basis: AgentLinkBasis }
	| {
			readonly state: "agent";
			readonly agentId: string;
			readonly basis: AgentLinkBasis;
	  }
	| { readonly state: "unlinked" };

/**
 * How the agent's context began, only as far as its records show it. An
 * inherited agent ran inside the attempt's inherited prefix, before the
 * attempt began.
 */
type AgentContextKind = "fresh" | "inherited" | "not recorded";

/** A user row after the agent's launching prompt, named for what it is. */
interface AgentTurn {
	readonly line: number;
	readonly kind: UserTurn;
}

/** One observed delivery of a source into an agent's context. */
interface AgentDelivery {
	readonly sourceId: string;
	readonly eventId: string;
	readonly ordinal: number;
	readonly measurement: TextMeasurement;
}

interface AgentReadings {
	readonly models: readonly string[];
	readonly series: SessionHistoryRequestSeries;
	readonly deliveries: readonly SessionHistorySource[];
	readonly deliveryEvents: readonly AgentDelivery[];
}

type RootAgent = AgentReadings;

/**
 * Nothing in a provider transcript has been observed to mark a resumed
 * sub-agent: the later user rows seen are compaction summaries and
 * interruption markers. Until one is, a resume reads as not recorded rather
 * than as a guess drawn from those rows.
 */
const RESUME_NOT_RECORDED = "not recorded";

interface SubagentIdentity {
	readonly agentId: string;
	readonly parent: AgentParent;
	/** The line of the parent's transcript holding the call that launched it. */
	readonly launchCallLine: number | undefined;
	readonly context: AgentContextKind;
	readonly resume: typeof RESUME_NOT_RECORDED;
}

type SubAgent = SubagentIdentity &
	(
		| ({
				readonly evidence: "available";
				readonly agentType: string | undefined;
				readonly description: string | undefined;
				readonly launchMode: string | undefined;
				readonly spawnDepth: number | undefined;
				readonly meta: AgentMetaState;
				readonly stopped: boolean | "not recorded";
				readonly laterTurns: readonly AgentTurn[];
		  } & AgentReadings)
		| { readonly evidence: "unavailable" }
	);

type AgentCoverage =
	| { readonly state: "complete" }
	| {
			readonly state: "incomplete";
			readonly unavailableAgentIds: readonly string[];
	  };

/**
 * Each agent holds its own series. Nothing here sums two agents' context
 * into one value, since agents running at once hold separate windows and a
 * sum would describe no window that existed.
 */
interface AgentTree {
	readonly root: RootAgent;
	readonly agents: readonly SubAgent[];
	readonly coverage: AgentCoverage;
}

export { RESUME_NOT_RECORDED as default };
export type {
	SubagentEvidence,
	AgentTreeInput,
	AgentLinkBasis,
	AgentParent,
	AgentContextKind,
	AgentTurn,
	AgentDelivery,
	AgentReadings,
	RootAgent,
	SubAgent,
	AgentCoverage,
	AgentTree,
};
