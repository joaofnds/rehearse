import type { InferResponseType } from "hono/client";

import type {
	SessionHistoryRequestEntry,
	TextMeasurement,
} from "#benchmark/session-history";
import type { apiClient } from "#client/api-client";
import type HTTP_STATUS from "#client/http-status";

import { categories } from "./request-timeline";

const NO_COUNTED_INPUT_TOKENS = 0;

const SINGLE_ITEM_COUNT = 1;

const EMPTY_COLLECTION_LENGTH = 0;

type AgentsResponse = InferResponseType<
	(typeof apiClient.api.attempts.session)[":caseId"][":uuid"]["history"]["agents"]["$get"],
	typeof HTTP_STATUS.ok
>;

type AvailableAgents = Extract<AgentsResponse, { state: "available" }>;

type Tree = AvailableAgents["tree"];

type SubAgent = Tree["agents"][number];

type AvailableSubAgent = Extract<SubAgent, { evidence: "available" }>;

type Allocation = AvailableAgents["cost"];

type AgentCost = Extract<Allocation, { state: "available" }>["root"];

type SkillCost = AgentCost["skills"][number];

type Readings = Tree["root"];

/** The root is the session itself; every other agent is named by its id. */
const ROOT_NAME = "Session root";

interface ExcerptRequest {
	/** Absent for the root, whose events the attempt's own routes serve. */
	readonly agentId: string | undefined;
	readonly eventId: string;
}

type Selection =
	| { readonly kind: "agent"; readonly agentId: string | undefined }
	| {
			readonly kind: "skill";
			readonly agentId: string | undefined;
			readonly deliveryLine: number;
	  };

const tokens = new Intl.NumberFormat("en-US");

function sizeLabel(measurement: TextMeasurement): string {
	const unit = "recorded text characters, not tokens and not cost";
	if (measurement.state === "complete") {
		return `${tokens.format(measurement.characters)} ${unit}`;
	}
	if (measurement.state === "partial") {
		return `◐ Partial · ${tokens.format(measurement.observedCharacters)} observed ${unit} · ${measurement.reasons.join(", ")}`;
	}

	return `? Unavailable size · ${measurement.reasons.join(", ")}`;
}

function agentName(agentId: string | undefined): string {
	return agentId ?? ROOT_NAME;
}

function agentLabel(agent: SubAgent, forkedSkill?: string): string {
	const inherited = agent.context === "inherited" ? "inherited" : undefined;
	if (agent.evidence === "unavailable") {
		return [agent.agentId, "evidence unavailable", inherited]
			.filter((part) => part !== undefined)
			.join(" · ");
	}

	return [
		agent.agentId,
		agent.agentType,
		forkedSkill === undefined ? undefined : `skill ${forkedSkill}`,
		agent.description,
		inherited,
		agent.stopped === true ? "stopped" : undefined,
	]
		.filter((part) => part !== undefined)
		.join(" · ");
}

function costOf(
	allocation: Allocation,
	agentId: string | undefined,
): AgentCost | undefined {
	if (allocation.state !== "available") {
		return undefined;
	}

	return agentId === undefined
		? allocation.root
		: allocation.agents.find((each) => each.agentId === agentId);
}

function forkedSkillOf(
	allocation: Allocation,
	agentId: string,
): string | undefined {
	return allocation.state === "available"
		? allocation.agents.find((each) => each.agentId === agentId)?.forkedSkill
		: undefined;
}

/**
 * An agent's peak over the attempt's requests, or over its inherited-prefix
 * requests when it ran only there.
 */
function peakLabel(entries: readonly SessionHistoryRequestEntry[]): string {
	const attempt = entries.filter(({ region }) => region !== "starting-context");
	const counted =
		attempt.length === EMPTY_COLLECTION_LENGTH ? entries : attempt;
	const scope =
		attempt.length === EMPTY_COLLECTION_LENGTH
			? "over its inherited-prefix requests"
			: "over the attempt's requests";
	let peak: number | undefined = undefined;
	for (const entry of counted) {
		if (entry.usageState === "complete") {
			peak = Math.max(peak ?? NO_COUNTED_INPUT_TOKENS, entry.totalInputTokens);
		}
	}

	return peak === undefined
		? "? Unavailable · no request in this agent carries settled usage"
		: `${tokens.format(peak)} total input tokens ${scope} · the peak of this agent's own request input, never summed with another agent's window`;
}

function totalsLabel(readings: Readings): string {
	const totals = readings.series.attemptTotals;
	if (totals.state === "unavailable") {
		return `? Unavailable · ${totals.reasons.join(", ")}`;
	}
	if (totals.state === "incomplete") {
		return `◐ Incomplete · ${categories(totals.usage)} over ${totals.countedRequestCount} of ${totals.requestCount} requests · ${totals.reasons.join(", ")}`;
	}

	return categories(totals.usage);
}

function requestLabel(entry: SessionHistoryRequestEntry): string {
	const size =
		entry.usageState === "complete"
			? `${tokens.format(entry.totalInputTokens)} total input tokens`
			: `usage ${entry.usageState}`;

	return [
		`line ${entry.line}`,
		entry.region === "starting-context" ? "inherited prefix" : undefined,
		entry.requestId ?? "no request id",
		size,
		entry.model ?? "? Unavailable model",
	]
		.filter((part) => part !== undefined)
		.join(" · ");
}

export {
	agentLabel,
	agentName,
	costOf,
	EMPTY_COLLECTION_LENGTH,
	forkedSkillOf,
	peakLabel,
	requestLabel,
	ROOT_NAME,
	SINGLE_ITEM_COUNT,
	sizeLabel,
	tokens,
	totalsLabel,
};
export type {
	AgentCost,
	AgentsResponse,
	Allocation,
	AvailableAgents,
	AvailableSubAgent,
	ExcerptRequest,
	Readings,
	Selection,
	SkillCost,
	SubAgent,
	Tree,
};
