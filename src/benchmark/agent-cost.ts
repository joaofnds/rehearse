import { basename } from "node:path";
import { z } from "zod";
import { agentTree } from "./agent-tree";
import type { AgentTree, AgentTreeInput, SubAgent } from "./agent-tree";
import type { ContextRateCatalog } from "./context-evidence-contract";
import type { ClaudeCallMetrics, Immutable } from "./contracts";
import { sessionHistoryRequestCosts } from "./session-history";
import type {
	SessionHistoryCostReading,
	SessionHistoryRequestCost,
	SessionHistoryRequestEntry,
	SessionHistoryRequestSeries,
} from "./session-history";
import { parseTranscript } from "./transcript";
import type { ToolUse, TranscriptLine } from "./transcript";

const SKILL_WINDOW_BASIS =
	"from the skill's delivery until the next skill delivery, user prompt or interruption, or the transcript's end; the transcript records no skill end.";
const OWN_BASIS = "every attempt request in the agent's own transcript";
const SHARED_BASIS =
	"requests after one request delivered more than one skill; not split between them";
const UNATTRIBUTED_BASIS = "requests outside every skill window";
const DESCENDANTS_BASIS =
	"own cost plus each descendant's total; never added into the attempt total";
const BOUNDARY_ABSENT = "the transcript carries no attempt boundary";
const COVERAGE_UNKNOWN_MODEL =
	"an agent without a kept transcript may have run on the same model";
const PREFIX_UNKNOWN_MODEL =
	"the inherited prefix holds a request on an unknown model";
const UNMODELED_REQUEST =
	"an attempt request names no model and may have run on any of them";
const PROVIDER_BASIS =
	"the provider's session count for models no other agent ran on";
const REPORTED_BASIS =
	"the provider's running count for the session, inherited prefix included";

/** A set of requests, what they cost, and the rule that put them together. */
export interface CostScope {
	readonly cost: SessionHistoryCostReading;
	readonly requestLines: readonly number[];
	readonly basis: string;
}

/**
 * A total including descendants. It is a reading of its own and is never
 * summed with another, since the descendants' own costs are already in the
 * attempt total.
 */
export interface DescendantTotal {
	readonly cost: SessionHistoryCostReading;
	readonly childAgentIds: readonly string[];
	readonly basis: string;
}

/** A slash command loads a skill's body with no tool call behind it. */
export type SkillInvoker =
	| { readonly by: "Skill call"; readonly toolUseId: string }
	| { readonly by: "slash command" };

export interface SkillInvocationCost {
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
export type ProviderAgentCost =
	| {
			readonly state: "reported";
			readonly costUsd: number;
			readonly models: readonly string[];
			readonly basis: string;
	  }
	| { readonly state: "not separable"; readonly reason: string };

/** An agent's own cost is the sum of its skills', shared and unattributed. */
export interface AgentCost {
	readonly own: CostScope;
	readonly skills: readonly SkillInvocationCost[];
	readonly shared: CostScope & { readonly skills: readonly string[] };
	readonly unattributed: CostScope;
	readonly includingDescendants: DescendantTotal;
	readonly provider: ProviderAgentCost;
}

export interface SubAgentCost extends AgentCost {
	readonly agentId: string;
	/** The skill this agent ran, when a Skill call forked into it. */
	readonly forkedSkill: string | undefined;
}

export interface ModelCost {
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
export type AttemptCostAllocation =
	| {
			readonly state: "available";
			readonly calculated: SessionHistoryCostReading;
			readonly root: AgentCost;
			readonly agents: readonly SubAgentCost[];
			readonly byModel: readonly ModelCost[];
	  }
	| { readonly state: "unavailable"; readonly reasons: readonly string[] };

export interface AgentCostInput extends AgentTreeInput {
	readonly rates: ContextRateCatalog;
	readonly modelUsage: ClaudeCallMetrics["modelUsage"];
}

const ROOT = Symbol("root");

type Owner = typeof ROOT | string;

interface Invocation {
	readonly skill: string;
	readonly invokedBy: SkillInvoker;
	readonly deliveryLine: number;
}

interface Delivery {
	readonly invocation: Invocation;
	readonly request: number | undefined;
}

/**
 * Deliveries that opened together, from one request, share one window. A
 * window with no close runs to the end of the agent's transcript.
 */
interface SkillWindow {
	readonly open: number;
	readonly close: number | undefined;
	readonly request: number | undefined;
	readonly invocations: readonly Invocation[];
}

interface SkillCall {
	readonly skill: string;
	readonly request: number | undefined;
}

interface Participant {
	readonly owner: Owner;
	readonly agent: SubAgent | undefined;
	readonly series: SessionHistoryRequestSeries;
	readonly lines: readonly TranscriptLine[];
	readonly attemptStart: number;
}

type RequestLocator = (line: number) => number | undefined;

/** Where each attempt request of one agent went, keyed by its first line. */
interface Allocation {
	readonly windowByRequest: ReadonlyMap<number, SkillWindow | undefined>;
	readonly windows: readonly SkillWindow[];
	readonly requestOf: RequestLocator;
	readonly costs: ReadonlyMap<number, SessionHistoryRequestCost>;
	readonly attemptEntries: readonly SessionHistoryRequestEntry[];
	/** Undefined among them for a request that names no model. */
	readonly models: ReadonlySet<string | undefined>;
}

type ReportedUsage = NonNullable<ClaudeCallMetrics["modelUsage"]>[string];

interface Ledger {
	readonly agents: readonly SubAgent[];
	readonly allocations: ReadonlyMap<Owner, Allocation>;
	/** Absent when a prefix request's model is unknown. */
	readonly modelsBeforeAttempt: ReadonlySet<string> | undefined;
	readonly unmodeled: boolean;
	readonly modelUsage: ReadonlyMap<string, ReportedUsage>;
	readonly coverageComplete: boolean;
	readonly totals: ReadonlyMap<Owner, Tally>;
}

const skillInputSchema = z.looseObject({ skill: z.string().min(1) });

function skillName(
	input: Immutable<ToolUse["input"]> | undefined,
): string | undefined {
	const parsed = skillInputSchema.safeParse(input);

	return parsed.success ? parsed.data.skill : undefined;
}

function skillCalls(
	lines: Immutable<readonly TranscriptLine[]>,
	requestOf: RequestLocator,
): ReadonlyMap<string, SkillCall> {
	const calls = new Map<string, SkillCall>();

	for (const { line, locatedToolUses } of lines) {
		for (const { use, toolUseId } of locatedToolUses) {
			if (use.name === "Skill" && toolUseId !== undefined) {
				calls.set(toolUseId, {
					skill: skillName(use.input) ?? "not recorded",
					request: requestOf(line),
				});
			}
		}
	}

	return calls;
}

/** The first line of the request a transcript row belongs to. */
function requestLocator(
	series: Immutable<SessionHistoryRequestSeries>,
	lines: Immutable<readonly TranscriptLine[]>,
): RequestLocator {
	const firstLineById = new Map<string, number>();
	for (const { requestId, line } of series.entries) {
		if (requestId !== undefined && !firstLineById.has(requestId)) {
			firstLineById.set(requestId, line);
		}
	}

	const requestIdByLine = new Map(
		lines.map(({ line, requestId }) => [line, requestId]),
	);

	return (line) => {
		const requestId = requestIdByLine.get(line);

		return requestId === undefined ? line : firstLineById.get(requestId);
	};
}

/**
 * A skill body answering a Skill call names the call. One loaded by a slash
 * command names none, and the skill is the directory the body opens with.
 */
function deliveryAt(
	row: Immutable<TranscriptLine>,
	calls: ReadonlyMap<string, SkillCall>,
): Delivery | undefined {
	const { line, sourceToolUseId, skillDirectories } = row;
	if (sourceToolUseId !== undefined) {
		const call = calls.get(sourceToolUseId);

		return call === undefined
			? undefined
			: {
					invocation: {
						skill: call.skill,
						invokedBy: { by: "Skill call", toolUseId: sourceToolUseId },
						deliveryLine: line,
					},
					request: call.request,
				};
	}

	const [directory] = skillDirectories;
	if (directory === undefined) {
		return undefined;
	}

	return {
		invocation: {
			skill: basename(directory),
			invokedBy: { by: "slash command" },
			deliveryLine: line,
		},
		request: undefined,
	};
}

/**
 * A window opens at a skill's observed delivery and closes at the next
 * delivery from another request, the next prompt, or the end of the
 * transcript. A compaction does not close it: nothing recorded shows that a
 * compaction unloads a skill.
 */
function skillWindows(
	participant: Immutable<Participant>,
	requestOf: RequestLocator,
): readonly SkillWindow[] {
	const calls = skillCalls(participant.lines, requestOf);
	const windows: SkillWindow[] = [];
	let current: SkillWindow | undefined;
	const close = (line: number): void => {
		if (current !== undefined) {
			windows.push({ ...current, close: line });
		}
		current = undefined;
	};

	for (const row of participant.lines) {
		const { line, userTurn } = row;
		if (line <= participant.attemptStart) {
			continue;
		}

		const delivery = deliveryAt(row, calls);
		if (delivery === undefined) {
			if (userTurn === "prompt" || userTurn === "interruption") {
				close(line);
			}
			continue;
		}

		const { invocation } = delivery;
		if (
			current?.request !== undefined &&
			current.request === delivery.request
		) {
			current = {
				...current,
				invocations: [...current.invocations, invocation],
			};
			continue;
		}

		close(line);
		current = {
			open: line,
			close: undefined,
			request: delivery.request,
			invocations: [invocation],
		};
	}

	if (current !== undefined) {
		windows.push(current);
	}

	return windows;
}

function windowAt(
	windows: Immutable<readonly SkillWindow[]>,
	line: number,
): SkillWindow | undefined {
	return windows.find(
		({ open, close }) => open <= line && (close === undefined || line < close),
	);
}

function allocate(
	participant: Immutable<Participant>,
	rates: ContextRateCatalog,
): Allocation {
	const requestOf = requestLocator(participant.series, participant.lines);
	const windows = skillWindows(participant, requestOf);
	const costs = sessionHistoryRequestCosts(participant.series, rates);
	const entries = attemptEntries(participant.series);

	return {
		windowByRequest: new Map(
			[...costs.keys()].map((line) => [line, windowAt(windows, line)]),
		),
		windows,
		requestOf,
		costs,
		attemptEntries: entries,
		models: spentModels(entries),
	};
}

function linesWhere(
	allocation: Readonly<Allocation>,
	keep: (window: Immutable<SkillWindow> | undefined) => boolean,
): readonly number[] {
	return [...allocation.windowByRequest]
		.filter(([, window]) => keep(window))
		.map(([line]) => line);
}

/**
 * A running count behind a reading, kept until the reading is formed so that a
 * sum of readings counts the requests of its complete parts too.
 */
interface Tally {
	readonly costUsd: number;
	readonly priced: number;
	readonly requests: number;
	readonly reasons: readonly string[];
}

function tally(
	lines: readonly number[],
	costs: ReadonlyMap<number, SessionHistoryRequestCost>,
): Tally {
	let costUsd = 0;
	let priced = 0;
	const reasons = new Set<string>();

	for (const line of lines) {
		const cost = costs.get(line);
		if (cost?.state === "priced") {
			costUsd += cost.costUsd;
			priced += 1;
		} else if (cost !== undefined) {
			reasons.add(cost.reason);
		}
	}

	return { costUsd, priced, requests: lines.length, reasons: [...reasons] };
}

/**
 * A sum of tallies. A part with no tally at all, such as an agent whose
 * transcript was not kept, adds its reason and no cost.
 */
function summed(
	parts: Immutable<readonly Tally[]>,
	missing: readonly string[],
): Tally {
	return {
		costUsd: parts.reduce((sum, { costUsd }) => sum + costUsd, 0),
		priced: parts.reduce((sum, { priced }) => sum + priced, 0),
		requests: parts.reduce((sum, { requests }) => sum + requests, 0),
		reasons: [
			...new Set([...missing, ...parts.flatMap(({ reasons }) => reasons)]),
		],
	};
}

function readingOf(counted: Immutable<Tally>): SessionHistoryCostReading {
	if (counted.reasons.length === 0) {
		return { state: "complete", costUsd: counted.costUsd };
	}

	return {
		state: "incomplete",
		costUsd: counted.costUsd,
		pricedRequestCount: counted.priced,
		requestCount: counted.requests,
		reasons: counted.reasons,
	};
}

function reading(
	lines: readonly number[],
	costs: ReadonlyMap<number, SessionHistoryRequestCost>,
): SessionHistoryCostReading {
	return readingOf(tally(lines, costs));
}

function unavailableAgentReason(agentId: string): string {
	return `no transcript was kept for sub-agent ${agentId}`;
}

/**
 * The models requests spent on, with undefined for a request that names none.
 * A request that carried no usage spent nothing, so the provider counts
 * nothing for its model, as for the rows it writes under the model name
 * "<synthetic>".
 */
function spentModels(
	entries: Immutable<readonly SessionHistoryRequestEntry[]>,
): ReadonlySet<string | undefined> {
	return new Set(
		entries
			.filter(
				(entry) =>
					entry.usageState !== "complete" ||
					entry.totalInputTokens + entry.usage.outputTokens > 0,
			)
			.map(({ model }) => model),
	);
}

function attemptEntries(
	series: Immutable<SessionHistoryRequestSeries>,
): readonly SessionHistoryRequestEntry[] {
	return series.entries.filter(({ region }) => region === "attempt");
}

function known(models: ReadonlySet<string | undefined>): ReadonlySet<string> {
	return new Set([...models].filter((model) => model !== undefined));
}

/** The root's prefix requests and every inherited agent's. */
function modelsBeforeAttempt(
	tree: Immutable<AgentTree>,
): ReadonlySet<string> | undefined {
	const entries = tree.root.series.entries.filter(
		({ region }) => region !== "attempt",
	);
	for (const agent of tree.agents) {
		if (agent.context !== "inherited") {
			continue;
		}

		if (agent.evidence !== "available") {
			return undefined;
		}

		entries.push(...agent.series.entries);
	}
	const models = spentModels(entries);

	return models.has(undefined) ? undefined : known(models);
}

function ownTally(allocation: Readonly<Allocation>): Tally {
	return tally([...allocation.windowByRequest.keys()], allocation.costs);
}

function childrenOf(
	owner: Owner,
	agents: Immutable<readonly SubAgent[]>,
): readonly SubAgent[] {
	return agents.filter(({ parent, context }) => {
		if (context === "inherited") {
			return false;
		}

		return owner === ROOT
			? parent.state === "root"
			: parent.state === "agent" && parent.agentId === owner;
	});
}

function descendantTally(
	own: Immutable<Tally>,
	children: Immutable<readonly SubAgent[]>,
	totals: ReadonlyMap<Owner, Tally>,
): Tally {
	const parts: Tally[] = [own];
	const missing: string[] = [];

	for (const { agentId, evidence } of children) {
		const total = totals.get(agentId);
		if (evidence === "available" && total !== undefined) {
			parts.push(total);
		} else {
			missing.push(unavailableAgentReason(agentId));
		}
	}

	return summed(parts, missing);
}

function descendantTotal(
	total: Immutable<Tally>,
	children: Immutable<readonly SubAgent[]>,
): DescendantTotal {
	return {
		cost: readingOf(total),
		childAgentIds: children.map(({ agentId }) => agentId),
		basis: DESCENDANTS_BASIS,
	};
}

function loopsBack(
	agentId: string,
	agents: Immutable<readonly SubAgent[]>,
): boolean {
	const parents = new Map(
		agents.map(({ agentId: id, parent }) => [id, parent]),
	);
	const seen = new Set<string>();
	let parent = parents.get(agentId);
	while (parent?.state === "agent") {
		if (seen.has(parent.agentId)) {
			return true;
		}

		seen.add(parent.agentId);
		parent = parents.get(parent.agentId);
	}

	return false;
}

/**
 * Each agent's total including descendants, children before parents. An
 * agent whose parent links loop, which only a hostile meta file could
 * produce, has no descendants to sum and reads its own cost, incomplete.
 * Every descendant of an agent outside a loop is outside it too.
 */
function descendantTotals(
	agents: Immutable<readonly SubAgent[]>,
	allocations: ReadonlyMap<Owner, Allocation>,
): ReadonlyMap<Owner, Tally> {
	const totals = new Map<Owner, Tally>();
	const visit = (owner: Owner): void => {
		const allocation = allocations.get(owner);
		if (totals.has(owner) || allocation === undefined) {
			return;
		}

		if (owner !== ROOT && loopsBack(owner, agents)) {
			totals.set(
				owner,
				summed(
					[ownTally(allocation)],
					[`the parent links of sub-agent ${owner} loop back to it`],
				),
			);
			return;
		}

		const children = childrenOf(owner, agents);
		for (const child of children) {
			visit(child.agentId);
		}
		totals.set(owner, descendantTally(ownTally(allocation), children, totals));
	};
	for (const owner of allocations.keys()) {
		visit(owner);
	}

	return totals;
}

function providerCost(
	owner: Owner,
	allocation: Readonly<Allocation>,
	ledger: Readonly<Ledger>,
): ProviderAgentCost {
	if (!ledger.coverageComplete) {
		return { state: "not separable", reason: COVERAGE_UNKNOWN_MODEL };
	}

	if (ledger.unmodeled) {
		return { state: "not separable", reason: UNMODELED_REQUEST };
	}

	if (ledger.modelsBeforeAttempt === undefined) {
		return { state: "not separable", reason: PREFIX_UNKNOWN_MODEL };
	}

	const models = [...known(allocation.models)].toSorted();
	if (models.length === 0) {
		return {
			state: "not separable",
			reason: "the agent made no attempt request with a recorded model",
		};
	}

	let costUsd = 0;
	for (const model of models) {
		if (ledger.modelsBeforeAttempt.has(model)) {
			return {
				state: "not separable",
				reason: `the inherited prefix also ran on ${model}`,
			};
		}

		const shared = [...ledger.allocations].some(
			([other, { models: used }]) => other !== owner && used.has(model),
		);
		if (shared) {
			return {
				state: "not separable",
				reason: `another agent ran on ${model}`,
			};
		}

		const usage = ledger.modelUsage.get(model);
		if (usage === undefined) {
			return {
				state: "not separable",
				reason: `the record carries no provider count for ${model}`,
			};
		}

		costUsd += usage.costUSD;
	}

	return { state: "reported", costUsd, models, basis: PROVIDER_BASIS };
}

function skillCosts(
	allocation: Readonly<Allocation>,
	children: Immutable<readonly SubAgent[]>,
	totals: ReadonlyMap<Owner, Tally>,
): readonly SkillInvocationCost[] {
	return allocation.windows
		.filter(({ invocations }) => invocations.length === 1)
		.flatMap((window) => {
			const requestLines = linesWhere(allocation, (each) => each === window);
			const own = tally(requestLines, allocation.costs);
			const launched = children.filter(({ launchCallLine }) => {
				const request =
					launchCallLine === undefined
						? undefined
						: allocation.requestOf(launchCallLine);

				return (
					request !== undefined &&
					allocation.windowByRequest.get(request) === window
				);
			});

			return window.invocations.map((invocation): SkillInvocationCost => ({
				skill: invocation.skill,
				invokedBy: invocation.invokedBy,
				deliveryLine: invocation.deliveryLine,
				own: { cost: readingOf(own), requestLines, basis: SKILL_WINDOW_BASIS },
				includingDescendants: descendantTotal(
					descendantTally(own, launched, totals),
					launched,
				),
			}));
		});
}

function agentCost(owner: Owner, ledger: Readonly<Ledger>): AgentCost {
	const allocation = ledger.allocations.get(owner);
	const total = ledger.totals.get(owner);
	if (allocation === undefined || total === undefined) {
		throw new Error(
			"every agent with a transcript has an allocation and a total",
		);
	}

	const children = childrenOf(owner, ledger.agents);
	const own = ownTally(allocation);
	const isShared = (window: Immutable<SkillWindow> | undefined): boolean =>
		window !== undefined && window.invocations.length > 1;
	const sharedLines = linesWhere(allocation, isShared);
	const unattributedLines = linesWhere(
		allocation,
		(window) => window === undefined,
	);

	return {
		own: {
			cost: readingOf(own),
			requestLines: [...allocation.windowByRequest.keys()],
			basis: OWN_BASIS,
		},
		skills: skillCosts(allocation, children, ledger.totals),
		shared: {
			cost: reading(sharedLines, allocation.costs),
			requestLines: sharedLines,
			basis: SHARED_BASIS,
			skills: allocation.windows
				.filter(isShared)
				.flatMap(({ invocations }) => invocations.map(({ skill }) => skill)),
		},
		unattributed: {
			cost: reading(unattributedLines, allocation.costs),
			requestLines: unattributedLines,
			basis: UNATTRIBUTED_BASIS,
		},
		includingDescendants: descendantTotal(total, children),
		provider: providerCost(owner, allocation, ledger),
	};
}

function forkedSkillOf(
	agent: Immutable<SubAgent>,
	participants: ReadonlyMap<Owner, Participant>,
): string | undefined {
	const { parent, launchCallLine } = agent;
	if (parent.state === "unlinked") {
		return undefined;
	}

	const call = participants
		.get(parent.state === "root" ? ROOT : parent.agentId)
		?.lines.find(({ line }) => line === launchCallLine)
		?.locatedToolUses.find(({ use }) => use.name === "Skill");

	return skillName(call?.use.input);
}

function modelCosts(
	ledger: Readonly<Ledger>,
	missing: readonly string[],
): readonly ModelCost[] {
	const models = new Set(ledger.modelUsage.keys());
	for (const allocation of ledger.allocations.values()) {
		for (const model of known(allocation.models)) {
			models.add(model);
		}
	}

	return [...models].toSorted().map((model): ModelCost => {
		const parts = [...ledger.allocations.values()].map((allocation) => {
			const lines = allocation.attemptEntries
				.filter((entry) => entry.model === model)
				.map(({ line }) => line);

			return tally(lines, allocation.costs);
		});
		const usage = ledger.modelUsage.get(model);

		return {
			model,
			reported:
				usage === undefined
					? {
							state: "unavailable",
							reasons: ["the record carries no provider count for this model"],
						}
					: { state: "complete", costUsd: usage.costUSD },
			reportedBasis: REPORTED_BASIS,
			calculated: readingOf(
				summed(
					parts,
					ledger.unmodeled ? [...missing, UNMODELED_REQUEST] : missing,
				),
			),
		};
	});
}

function participantsOf(
	input: Immutable<AgentCostInput>,
	tree: Immutable<AgentTree>,
): ReadonlyMap<Owner, Participant> {
	const transcripts = new Map(
		input.subagents.map(({ agentId, transcript }) => [agentId, transcript]),
	);
	const participants = new Map<Owner, Participant>([
		[
			ROOT,
			{
				owner: ROOT,
				agent: undefined,
				series: tree.root.series,
				lines: parseTranscript(input.transcript),
				attemptStart: input.prefixLinesExcluded ?? 0,
			},
		],
	]);

	for (const agent of tree.agents) {
		const transcript = transcripts.get(agent.agentId);
		if (
			agent.evidence === "available" &&
			agent.context !== "inherited" &&
			transcript !== undefined
		) {
			participants.set(agent.agentId, {
				owner: agent.agentId,
				agent,
				series: agent.series,
				lines: parseTranscript(transcript),
				attemptStart: 0,
			});
		}
	}

	return participants;
}

/**
 * Allocates each attempt request's calculated cost to one agent and, within
 * it, to one skill window, the shared remainder or the unattributed remainder,
 * and gives each skill and agent a total including its descendants. The
 * provider's per-model count is shown beside the calculated one, and reaches
 * an agent only where it ran alone on its models. A caller that already
 * built the input's tree passes it, so the transcripts are read once.
 */
export function agentCostAllocation(
	input: Immutable<AgentCostInput>,
	tree: Immutable<AgentTree> = agentTree(input),
): AttemptCostAllocation {
	if (tree.root.series.boundary === "unknown") {
		return { state: "unavailable", reasons: [BOUNDARY_ABSENT] };
	}

	const participants = participantsOf(input, tree);
	const allocations = new Map<Owner, Allocation>(
		[...participants].map(([owner, participant]) => [
			owner,
			allocate(participant, input.rates),
		]),
	);
	const ledger: Ledger = {
		agents: tree.agents,
		allocations,
		modelsBeforeAttempt: modelsBeforeAttempt(tree),
		unmodeled: [...allocations.values()].some(({ models }) =>
			models.has(undefined),
		),
		modelUsage: new Map(Object.entries(input.modelUsage ?? {})),
		coverageComplete: tree.coverage.state === "complete",
		totals: descendantTotals(tree.agents, allocations),
	};
	const missing =
		tree.coverage.state === "incomplete"
			? tree.coverage.unavailableAgentIds.map(unavailableAgentReason)
			: [];

	const agents: SubAgentCost[] = [];
	for (const { owner, agent } of participants.values()) {
		if (owner !== ROOT && agent !== undefined) {
			agents.push({
				agentId: agent.agentId,
				forkedSkill: forkedSkillOf(agent, participants),
				...agentCost(owner, ledger),
			});
		}
	}

	return {
		state: "available",
		calculated: readingOf(
			summed(
				[...allocations.values()].map((allocation) => ownTally(allocation)),
				missing,
			),
		),
		root: agentCost(ROOT, ledger),
		agents,
		byModel: modelCosts(ledger, missing),
	};
}
