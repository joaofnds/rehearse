import type { AgentTreeInput } from "./agent-tree";
import type { ContextRateCatalog } from "./context-evidence-contract";
import type { ClaudeCallMetrics } from "./contracts";
import type { SessionHistoryCostReading } from "./session-history";

/** A set of requests, what they cost, and the rule that put them together. */
interface CostScope {
	readonly cost: SessionHistoryCostReading;
	readonly requestLines: readonly number[];
	readonly basis: string;
}

/**
 * A total including descendants. It is a reading of its own and is never
 * summed with another, since the descendants' own costs are already in the
 * attempt total.
 */
interface DescendantTotal {
	readonly cost: SessionHistoryCostReading;
	readonly childAgentIds: readonly string[];
	readonly basis: string;
}

/** A slash command loads a skill's body with no tool call behind it. */
type SkillInvoker =
	| { readonly by: "Skill call"; readonly toolUseId: string }
	| { readonly by: "slash command" };

interface SkillInvocationCost {
	readonly skill: string;
	readonly invokedBy: SkillInvoker;
	readonly deliveryLine: number;
	readonly own: CostScope;
	readonly includingDescendants: DescendantTotal;
}

/**
 * The provider counts cost per model for the whole session. That count is one
 * agent's only when no other agent ran on its models.
 */
type ProviderAgentCost =
	| {
			readonly state: "reported";
			readonly costUsd: number;
			readonly models: readonly string[];
			readonly basis: string;
	  }
	| { readonly state: "not separable"; readonly reason: string };

/** An agent's own cost is the sum of its skills', shared and unattributed. */
interface AgentCost {
	readonly own: CostScope;
	readonly skills: readonly SkillInvocationCost[];
	readonly shared: CostScope & { readonly skills: readonly string[] };
	readonly unattributed: CostScope;
	readonly includingDescendants: DescendantTotal;
	readonly provider: ProviderAgentCost;
}

interface SubAgentCost extends AgentCost {
	readonly agentId: string;
	/** The skill this agent ran, when a Skill call forked into it. */
	readonly forkedSkill: string | undefined;
}

interface ModelCost {
	readonly model: string;
	readonly reported: SessionHistoryCostReading;
	readonly reportedBasis: string;
	readonly calculated: SessionHistoryCostReading;
}

/**
 * Every attempt request counted once, under one agent and, within it, under
 * one skill window, the shared remainder or the unattributed remainder. An
 * inherited agent ran before the attempt and is left out.
 */
type AttemptCostAllocation =
	| {
			readonly state: "available";
			readonly calculated: SessionHistoryCostReading;
			readonly root: AgentCost;
			readonly agents: readonly SubAgentCost[];
			readonly byModel: readonly ModelCost[];
	  }
	| { readonly state: "unavailable"; readonly reasons: readonly string[] };

interface AgentCostInput extends AgentTreeInput {
	readonly rates: ContextRateCatalog;
	readonly modelUsage: ClaudeCallMetrics["modelUsage"];
}
export type {
	CostScope,
	DescendantTotal,
	SkillInvoker,
	SkillInvocationCost,
	ProviderAgentCost,
	AgentCost,
	SubAgentCost,
	ModelCost,
	AttemptCostAllocation,
	AgentCostInput,
};
