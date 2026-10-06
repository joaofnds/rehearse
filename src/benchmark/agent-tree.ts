import { z } from "zod";
import type { Immutable } from "./contracts";
import {
	sessionHistoryReport,
	sessionHistoryRequestSeries,
} from "./session-history";
import { parseTranscript } from "./transcript";
import type { TranscriptLine, UserTurn } from "./transcript";
import type {
	CorpusFileLocation,
	SessionHistoryAttemptIdentity,
	SessionHistoryRequestSeries,
	SessionHistorySource,
	TextMeasurement,
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

/** A user row after the agent's launching prompt, named for what it is. */
export interface AgentTurn {
	readonly line: number;
	readonly kind: UserTurn;
}

/** One observed delivery of a source into an agent's context. */
export interface AgentDelivery {
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
	/** The line of the parent's transcript holding the call that launched it. */
	readonly launchCallLine: number | undefined;
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
				readonly meta: AgentMetaState;
				readonly stopped: boolean | "not recorded";
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

/**
 * Whether the agent's meta file was read. An unreadable one is kept apart from
 * a missing one, since provider drift in one field fails the whole file.
 */
export type AgentMetaState = "recorded" | "not recorded" | "unreadable";

interface AgentMeta {
	readonly state: AgentMetaState;
	readonly agentType?: string | undefined;
	readonly description?: string | undefined;
	readonly toolUseId?: string | undefined;
	readonly parentAgentId?: string | undefined;
	readonly spawnDepth?: number | undefined;
	readonly launchMode?: string | undefined;
	readonly stoppedByUser?: boolean | undefined;
}

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

/**
 * An agent's parent, the place its launch was recorded, if any was, and the
 * launching call's line where the call itself was found.
 */
interface AgentLink {
	readonly parent: AgentParent;
	readonly launch: Located | undefined;
	readonly callLine: number | undefined;
}

interface LaunchIndex {
	readonly calls: ReadonlyMap<string, LaunchCall>;
	readonly results: ReadonlyMap<string, NamingResult>;
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
	const result = index.results.get(agentId);
	const answered =
		result?.toolUseId === undefined
			? undefined
			: index.calls.get(result.toolUseId);
	if (meta.parentAgentId !== undefined) {
		return {
			parent: {
				state: "agent",
				agentId: meta.parentAgentId,
				basis: "parent agent id",
			},
			launch: result,
			callLine:
				answered?.owner === meta.parentAgentId ? answered.line : undefined,
		};
	}

	const call =
		meta.toolUseId === undefined ? undefined : index.calls.get(meta.toolUseId);
	if (call !== undefined) {
		return {
			parent: linkTo(call.owner, "launch call"),
			launch: call,
			callLine: call.line,
		};
	}

	if (result === undefined) {
		return {
			parent: { state: "unlinked" },
			launch: undefined,
			callLine: undefined,
		};
	}

	const basis = answered?.name === "Skill" ? "skill result" : "agent result";

	return {
		parent: linkTo(result.owner, basis),
		launch: result,
		callLine: answered?.line,
	};
}

function linkTo(owner: Owner, basis: AgentLinkBasis): AgentParent {
	return owner === ROOT
		? { state: "root", basis }
		: { state: "agent", agentId: owner, basis };
}

function readMeta(text: string | undefined): AgentMeta {
	if (text === undefined) {
		return { state: "not recorded" };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return { state: "unreadable" };
	}

	const meta = metaSchema.safeParse(parsed);
	if (!meta.success) {
		return { state: "unreadable" };
	}

	return {
		state: "recorded",
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
	const events = inherited ? report.startingContext : report.attemptEvents;
	const models = new Set(
		series.entries
			.map(({ model }) => model)
			.filter((model) => model !== undefined),
	);

	return {
		models: [...models],
		series,
		deliveries: sources.filter(
			({ observedDeliveryCount }) => observedDeliveryCount !== 0,
		),
		deliveryEvents: events.flatMap(
			({ id, sourceId, deliveryOrdinal, measurement }): AgentDelivery[] =>
				sourceId === undefined || deliveryOrdinal === undefined
					? []
					: [{ sourceId, eventId: id, ordinal: deliveryOrdinal, measurement }],
		),
	};
}

function firstRowIsFresh(lines: Immutable<readonly TranscriptLine[]>): boolean {
	const first = lines.find(
		({ diagnosticIssues }) =>
			!diagnosticIssues.some(({ kind }) => kind === "invalid-json"),
	);

	return first?.startsWithoutParent === true;
}

function laterTurns(
	lines: Immutable<readonly TranscriptLine[]>,
): readonly AgentTurn[] {
	const turns: AgentTurn[] = [];
	for (const { line, userTurn } of lines) {
		if (userTurn !== undefined) {
			turns.push({ line, kind: userTurn });
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

/**
 * A child's transcript holds no attempt boundary of its own. An inherited
 * child ran wholly before the attempt and a later one wholly inside it, and
 * where the attempt's own boundary is unknown, so is the child's.
 */
function childPrefixLinesExcluded(
	input: Immutable<AgentTreeInput>,
	file: Immutable<SubagentEvidence>,
	inherited: boolean,
): number | undefined {
	if (input.prefixLinesExcluded === undefined) {
		return undefined;
	}

	return inherited ? lineCount(file.transcript) : 0;
}

function availableAgent(
	input: Immutable<AgentTreeInput>,
	file: Immutable<SubagentEvidence>,
	link: Immutable<AgentLink>,
	inherited: boolean,
): SubAgent {
	const meta = readMeta(file.meta);
	const lines = parseTranscript(file.transcript);
	let context: AgentContextKind = "not recorded";
	if (inherited) {
		context = "inherited";
	} else if (firstRowIsFresh(lines)) {
		context = "fresh";
	}
	const { models, series, deliveries, deliveryEvents } = readings(
		input,
		file.transcript,
		childPrefixLinesExcluded(input, file, inherited),
		inherited,
	);

	return {
		agentId: file.agentId,
		parent: link.parent,
		launchCallLine: link.callLine,
		context,
		resume: RESUME_NOT_RECORDED,
		evidence: "available",
		agentType: meta.agentType,
		description: meta.description,
		launchMode: meta.launchMode,
		spawnDepth: meta.spawnDepth,
		meta: meta.state,
		stopped:
			meta.state === "recorded" ? meta.stoppedByUser === true : "not recorded",
		laterTurns: laterTurns(lines),
		models,
		series,
		deliveries,
		deliveryEvents,
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
		const link = links.get(agentId) ?? {
			parent: { state: "unlinked" },
			launch: undefined,
			callLine: undefined,
		};
		const inherited = isInherited(agentId, links, input.prefixLinesExcluded);
		if (file === undefined) {
			return {
				agentId,
				parent: link.parent,
				launchCallLine: link.callLine,
				context: inherited ? "inherited" : "not recorded",
				resume: RESUME_NOT_RECORDED,
				evidence: "unavailable",
			};
		}

		return availableAgent(input, file, link, inherited);
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
