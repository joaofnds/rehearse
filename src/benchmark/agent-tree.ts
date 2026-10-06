import { z } from "zod";
import type { Immutable } from "./contracts";
import {
	sessionHistoryReport,
	sessionHistoryRequestSeries,
} from "./session-history";
import { parseTranscript } from "./transcript";
import type { TranscriptLine } from "./transcript";
import type {
	CorpusFileLocation,
	SessionHistoryAttemptIdentity,
	SessionHistoryRequestSeries,
	SessionHistorySource,
} from "./session-history";

/** One sub-agent's files as the record holds them. */
export interface SubagentEvidence {
	readonly agentId: string;
	readonly transcript: string;
	/** Absent when the record holds no meta file for the agent. */
	readonly meta: string | undefined;
}

export interface AgentTreeInput {
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
export type AgentLinkBasis =
	| "launch call"
	| "parent agent id"
	| "agent result"
	| "skill result";

export type AgentParent =
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
export type AgentContextKind = "fresh" | "inherited" | "not recorded";

export type AgentTurnKind = "compaction summary" | "interruption" | "prompt";

/** A user row after the agent's launching prompt, named for what it is. */
export interface AgentTurn {
	readonly line: number;
	readonly kind: AgentTurnKind;
}

interface AgentReadings {
	readonly models: readonly string[];
	readonly series: SessionHistoryRequestSeries;
	readonly deliveries: readonly SessionHistorySource[];
}

export type RootAgent = AgentReadings;

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
	readonly context: AgentContextKind;
	readonly resume: typeof RESUME_NOT_RECORDED;
}

export type SubAgent = SubagentIdentity &
	(
		| ({
				readonly evidence: "available";
				readonly agentType: string | undefined;
				readonly description: string | undefined;
				readonly launchMode: string | undefined;
				readonly spawnDepth: number | undefined;
				readonly stopped: boolean;
				readonly laterTurns: readonly AgentTurn[];
		  } & AgentReadings)
		| { readonly evidence: "unavailable" }
	);

export type AgentCoverage =
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
export interface AgentTree {
	readonly root: RootAgent;
	readonly agents: readonly SubAgent[];
	readonly coverage: AgentCoverage;
}

/**
 * The provider's name for the meta field saying whether the agent was launched
 * in the foreground or the background. It is the provider's key, kept as data
 * so that no name of this project's carries it.
 */
const PROVIDER_LAUNCH_MODE_KEY = "requestShape";

const metaSchema = z.looseObject({
	agentType: z.string().min(1).optional(),
	description: z.string().optional(),
	toolUseId: z.string().min(1).optional(),
	parentAgentId: z.string().min(1).optional(),
	spawnDepth: z.number().int().nonnegative().optional(),
	[PROVIDER_LAUNCH_MODE_KEY]: z.string().min(1).optional(),
	stoppedByUser: z.boolean().optional(),
});

interface AgentMeta {
	readonly agentType?: string | undefined;
	readonly description?: string | undefined;
	readonly toolUseId?: string | undefined;
	readonly parentAgentId?: string | undefined;
	readonly spawnDepth?: number | undefined;
	readonly launchMode?: string | undefined;
	readonly stoppedByUser?: boolean | undefined;
}

const toolResultBlockSchema = z.looseObject({
	type: z.literal("tool_result"),
	tool_use_id: z.string().min(1),
});

const userRowSchema = z.looseObject({
	type: z.literal("user"),
	parentUuid: z.string().nullish(),
	isMeta: z.boolean().optional(),
	isCompactSummary: z.boolean().optional(),
	message: z.looseObject({
		content: z.union([
			z.string().transform((text) => [{ type: "text", text }]),
			z.array(z.unknown()),
		]),
	}),
});

type UserRow = z.infer<typeof userRowSchema>;

const textBlockSchema = z.looseObject({
	type: z.literal("text"),
	text: z.string(),
});

const INTERRUPTION_MARKER = "[Request interrupted by user";

const ROOT = Symbol("root");

type Owner = typeof ROOT | string;

interface Located {
	readonly owner: Owner;
	readonly line: number;
}

interface LaunchCall extends Located {
	readonly name: string;
}

interface NamingResult extends Located {
	readonly toolUseId: string | undefined;
}

/** An agent's parent, and the place its launch was recorded, if any was. */
interface AgentLink {
	readonly parent: AgentParent;
	readonly launch: Located | undefined;
}

interface LaunchIndex {
	readonly calls: ReadonlyMap<string, LaunchCall>;
	readonly results: ReadonlyMap<string, NamingResult>;
}

function decodedRows(
	transcript: string,
): readonly (readonly [number, unknown])[] {
	const rows: [number, unknown][] = [];
	for (const [index, text] of transcript.split("\n").entries()) {
		if (text.trim() === "") {
			continue;
		}
		try {
			rows.push([index + 1, JSON.parse(text)]);
		} catch {
			continue;
		}
	}

	return rows;
}

interface OwnedLine {
	readonly owner: Owner;
	readonly parsed: TranscriptLine;
}

function launchIndex(transcripts: ReadonlyMap<Owner, string>): LaunchIndex {
	const calls = new Map<string, LaunchCall>();
	const results = new Map<string, NamingResult>();
	const lines = [...transcripts].flatMap(([owner, transcript]) =>
		parseTranscript(transcript).map((parsed): OwnedLine => ({ owner, parsed })),
	);
	for (const { owner, parsed } of lines) {
		for (const { use, toolUseId } of parsed.locatedToolUses) {
			if (toolUseId !== undefined && !calls.has(toolUseId)) {
				calls.set(toolUseId, { owner, line: parsed.line, name: use.name });
			}
		}
		const agentId = parsed.namedAgent;
		if (agentId !== undefined && !results.has(agentId)) {
			results.set(agentId, {
				owner,
				line: parsed.line,
				toolUseId: parsed.locatedToolResults[0]?.toolUseId,
			});
		}
	}

	return { calls, results };
}

function parentFor(
	agentId: string,
	meta: Readonly<AgentMeta>,
	index: LaunchIndex,
): AgentLink {
	if (meta.parentAgentId !== undefined) {
		return {
			parent: {
				state: "agent",
				agentId: meta.parentAgentId,
				basis: "parent agent id",
			},
			launch: index.results.get(agentId),
		};
	}
	const call =
		meta.toolUseId === undefined ? undefined : index.calls.get(meta.toolUseId);
	if (call !== undefined) {
		return { parent: linkTo(call.owner, "launch call"), launch: call };
	}
	const result = index.results.get(agentId);
	if (result === undefined) {
		return { parent: { state: "unlinked" }, launch: undefined };
	}
	const answered =
		result.toolUseId === undefined
			? undefined
			: index.calls.get(result.toolUseId);
	const basis = answered?.name === "Skill" ? "skill result" : "agent result";

	return { parent: linkTo(result.owner, basis), launch: result };
}

function linkTo(owner: Owner, basis: AgentLinkBasis): AgentParent {
	return owner === ROOT
		? { state: "root", basis }
		: { state: "agent", agentId: owner, basis };
}

function readMeta(text: string | undefined): AgentMeta {
	if (text === undefined) {
		return {};
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return {};
	}
	const meta = metaSchema.safeParse(parsed);
	if (!meta.success) {
		return {};
	}

	return {
		agentType: meta.data.agentType,
		description: meta.data.description,
		toolUseId: meta.data.toolUseId,
		parentAgentId: meta.data.parentAgentId,
		spawnDepth: meta.data.spawnDepth,
		launchMode: meta.data[PROVIDER_LAUNCH_MODE_KEY],
		stoppedByUser: meta.data.stoppedByUser,
	};
}

function lineCount(transcript: string): number {
	return transcript.split("\n").length;
}

function readings(
	input: Immutable<AgentTreeInput>,
	transcript: string,
	prefixLinesExcluded: number | undefined,
	inherited: boolean,
): AgentReadings {
	const series = sessionHistoryRequestSeries({
		transcript,
		prefixLinesExcluded,
	});
	const report = sessionHistoryReport({
		attempt: input.attempt,
		resolvedCorpusFiles: input.resolvedCorpusFiles,
		transcript,
		prefixLinesExcluded,
	});
	const sources = inherited ? report.startingSources : report.sources;
	const models = new Set(
		series.entries
			.map(({ model }) => model)
			.filter((model) => model !== undefined),
	);

	return {
		models: [...models],
		series,
		deliveries: sources.filter(
			({ observedDeliveryCount }) => (observedDeliveryCount ?? 0) > 0,
		),
	};
}

function firstRowIsFresh(transcript: string): boolean {
	const [first] = decodedRows(transcript);
	const row =
		first === undefined ? undefined : userRowSchema.safeParse(first[1]);

	return (
		row?.success === true &&
		(row.data.parentUuid === null || row.data.parentUuid === undefined)
	);
}

function turnKind(row: Immutable<UserRow>): AgentTurnKind | undefined {
	if (row.isMeta === true) {
		return undefined;
	}
	if (row.isCompactSummary === true) {
		return "compaction summary";
	}
	const blocks = row.message.content;
	if (blocks.some((block) => toolResultBlockSchema.safeParse(block).success)) {
		return undefined;
	}
	const interrupted = blocks.some((block) => {
		const text = textBlockSchema.safeParse(block);

		return text.success && text.data.text.startsWith(INTERRUPTION_MARKER);
	});

	return interrupted ? "interruption" : "prompt";
}

function laterTurns(transcript: string): readonly AgentTurn[] {
	const turns: AgentTurn[] = [];
	for (const [line, value] of decodedRows(transcript)) {
		const row = userRowSchema.safeParse(value);
		const kind = row.success ? turnKind(row.data) : undefined;
		if (kind !== undefined) {
			turns.push({ line, kind });
		}
	}

	return turns.slice(1);
}

function isInherited(
	agentId: string,
	links: ReadonlyMap<string, AgentLink>,
	prefixLinesExcluded: number | undefined,
	seen: ReadonlySet<string> = new Set(),
): boolean {
	const link = links.get(agentId);
	if (link === undefined || seen.has(agentId)) {
		return false;
	}
	const { launch, parent } = link;
	if (
		launch?.owner === ROOT &&
		prefixLinesExcluded !== undefined &&
		launch.line <= prefixLinesExcluded
	) {
		return true;
	}

	return (
		parent.state === "agent" &&
		isInherited(
			parent.agentId,
			links,
			prefixLinesExcluded,
			new Set([...seen, agentId]),
		)
	);
}

function availableAgent(
	input: Immutable<AgentTreeInput>,
	file: Immutable<SubagentEvidence>,
	parent: AgentParent,
	inherited: boolean,
): SubAgent {
	const meta = readMeta(file.meta);
	let context: AgentContextKind = "not recorded";
	if (inherited) {
		context = "inherited";
	} else if (firstRowIsFresh(file.transcript)) {
		context = "fresh";
	}
	const { models, series, deliveries } = readings(
		input,
		file.transcript,
		inherited ? lineCount(file.transcript) : 0,
		inherited,
	);

	return {
		agentId: file.agentId,
		parent,
		context,
		resume: RESUME_NOT_RECORDED,
		evidence: "available",
		agentType: meta.agentType,
		description: meta.description,
		launchMode: meta.launchMode,
		spawnDepth: meta.spawnDepth,
		stopped: meta.stoppedByUser === true,
		laterTurns: laterTurns(file.transcript),
		models,
		series,
		deliveries,
	};
}

/**
 * Projects a session attempt's agents from its own transcript and the
 * sub-agent files its record holds. Every agent a transcript names is in the
 * tree, and one the record holds no transcript for reads as unavailable; it
 * leaves coverage incomplete unless it ran in the inherited prefix, before
 * the attempt.
 */
export function agentTree(input: Immutable<AgentTreeInput>): AgentTree {
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

	const agents = agentIds.map((agentId): SubAgent => {
		const file = files.get(agentId);
		const parent = links.get(agentId)?.parent ?? { state: "unlinked" };
		const inherited = isInherited(agentId, links, input.prefixLinesExcluded);
		if (file === undefined) {
			return {
				agentId,
				parent,
				context: inherited ? "inherited" : "not recorded",
				resume: RESUME_NOT_RECORDED,
				evidence: "unavailable",
			};
		}

		return availableAgent(input, file, parent, inherited);
	});
	const unavailableAgentIds = agents
		.filter(
			(agent) =>
				agent.evidence === "unavailable" && agent.context !== "inherited",
		)
		.map(({ agentId }) => agentId);

	return {
		root: readings(input, input.transcript, input.prefixLinesExcluded, false),
		agents,
		coverage:
			unavailableAgentIds.length === 0
				? { state: "complete" }
				: { state: "incomplete", unavailableAgentIds },
	};
}
