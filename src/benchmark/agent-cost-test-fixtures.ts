import { join } from "node:path";

import agentCostAllocation from "#benchmark/agent-cost";
import type {
	AgentCost,
	AttemptCostAllocation,
	SkillInvocationCost,
	SubAgentCost,
} from "#benchmark/agent-cost";
import type { AgentTreeInput, SubagentEvidence } from "#benchmark/agent-tree";
import type { ClaudeCallMetrics, ClaudeModelUsage } from "#benchmark/contracts";
import { committedRateCatalog } from "#benchmark/rate-catalog";
import type { SessionHistoryCostReading } from "#benchmark/session-history";
import { recordedSubagents } from "#benchmark/subagent-evidence";

import type { AgentCostInput } from "./agent-cost";

const INITIAL_PROVIDER_USAGE_COST_USD = 0.03;

const LATER_PROVIDER_USAGE_COST_USD = 0.04;

const PREFIX_START_INDEX = 0;

const NO_SPEND_USD = 0;

const FIXTURE = join(import.meta.dir, "__fixtures__", "agent-tree");

const INHERITED_PREFIX_LINES = 3;

/** The fixture transcript up to, and not including, a4's launch. */
const LINES_BEFORE_A4_LAUNCH = 19;

interface FixtureOverrides {
	readonly prefixLinesExcluded?: number | undefined;
	readonly transcript?: (lines: readonly string[]) => readonly string[];
	readonly rates?: AllocationRates;
	readonly modelUsage?: ClaudeCallMetrics["modelUsage"];
	readonly subagents?: (
		recorded: readonly SubagentEvidence[],
	) => readonly SubagentEvidence[];
}

type AllocationRates = AgentCostInput["rates"];

async function fixtureInput(
	overrides: FixtureOverrides = {},
): Promise<AgentTreeInput> {
	const transcript = await Bun.file(join(FIXTURE, "transcript.jsonl")).text();
	const lines = transcript.split("\n");
	const recorded = await recordedSubagents(FIXTURE);

	return {
		attempt: {
			caseId: "case-a",
			corpusFiles: [],
			id: "attempt-a",
			kind: "session",
			model: "sonnet",
			outcome: "SUCCESSFUL",
		},
		prefixLinesExcluded:
			"prefixLinesExcluded" in overrides
				? overrides.prefixLinesExcluded
				: INHERITED_PREFIX_LINES,
		resolvedCorpusFiles: [],
		subagents: overrides.subagents?.(recorded) ?? recorded,
		transcript: (overrides.transcript?.(lines) ?? lines).join("\n"),
	};
}

async function fixtureAllocation(
	overrides: FixtureOverrides = {},
): Promise<AttemptCostAllocation> {
	return agentCostAllocation({
		...(await fixtureInput(overrides)),
		modelUsage: overrides.modelUsage,
		rates: overrides.rates ?? committedRateCatalog,
	});
}

function available(
	allocation: AttemptCostAllocation,
): Extract<AttemptCostAllocation, { state: "available" }> {
	if (allocation.state !== "available") {
		throw new Error(`allocation is ${allocation.state}`);
	}

	return allocation;
}

function agent(
	allocation: AttemptCostAllocation,
	agentId: string,
): SubAgentCost {
	const found = available(allocation).agents.find(
		(each) => each.agentId === agentId,
	);
	if (found === undefined) {
		throw new Error(`no cost for ${agentId}`);
	}

	return found;
}

function costOf(reading: SessionHistoryCostReading): number {
	return reading.state === "unavailable" ? Number.NaN : reading.costUsd;
}

function reasonsOf(reading: SessionHistoryCostReading): readonly string[] {
	return reading.state === "complete" ? [] : reading.reasons;
}

function partsOf(each: AgentCost): number {
	return (
		each.skills.reduce(
			(sum, skill) => sum + costOf(skill.own.cost),
			NO_SPEND_USD,
		) +
		costOf(each.shared.cost) +
		costOf(each.unattributed.cost)
	);
}

function skillNamed(each: AgentCost, skill: string): SkillInvocationCost {
	const found = each.skills.find((invocation) => invocation.skill === skill);
	if (found === undefined) {
		throw new Error(`no invocation of ${skill}`);
	}

	return found;
}

function modelUsage(costUSD: number): ClaudeModelUsage {
	return {
		cacheCreationInputTokens: 0,
		cacheReadInputTokens: 0,
		contextWindow: 0,
		costUSD,
		inputTokens: 0,
		maxOutputTokens: 0,
		outputTokens: 0,
	};
}

const sonnetOnly = {
	...committedRateCatalog,
	models: committedRateCatalog.models.filter(
		({ model }) => model === "claude-sonnet-5",
	),
};

const withoutA4 = {
	modelUsage: {
		"claude-opus-5": modelUsage(INITIAL_PROVIDER_USAGE_COST_USD),
		"claude-sonnet-5": modelUsage(LATER_PROVIDER_USAGE_COST_USD),
	},
	prefixLinesExcluded: 0,
	subagents: (recorded: readonly SubagentEvidence[]): SubagentEvidence[] =>
		recorded.filter(({ agentId }) => agentId !== "a0"),
	transcript: (lines: readonly string[]): string[] =>
		lines.slice(INHERITED_PREFIX_LINES, LINES_BEFORE_A4_LAUNCH),
};

const withPrefix = {
	...withoutA4,
	prefixLinesExcluded: INHERITED_PREFIX_LINES,
	subagents: (
		recorded: readonly SubagentEvidence[],
	): readonly SubagentEvidence[] => recorded,
	transcript: (lines: readonly string[]): string[] =>
		lines.slice(PREFIX_START_INDEX, LINES_BEFORE_A4_LAUNCH),
};

const unmodeled = {
	...withoutA4,
	transcript: (lines: readonly string[]): string[] =>
		withoutA4
			.transcript(lines)
			.map((row) =>
				row.includes('"requestId":"req-r1"')
					? row.replace('"model":"claude-sonnet-5",', "")
					: row,
			),
};
export {
	fixtureInput,
	fixtureAllocation,
	available,
	agent,
	costOf,
	reasonsOf,
	partsOf,
	skillNamed,
	modelUsage,
	sonnetOnly,
	withoutA4,
	withPrefix,
	unmodeled,
};
