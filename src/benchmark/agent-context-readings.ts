import readMeta from "./agent-metadata";
import type { AgentLink } from "./agent-parent-links";
import RESUME_NOT_RECORDED from "./agent-tree-contract";
import type {
	AgentContextKind,
	AgentDelivery,
	AgentReadings,
	AgentTreeInput,
	AgentTurn,
	SubAgent,
	SubagentEvidence,
} from "./agent-tree-contract";
import type { Immutable } from "./contracts";
import {
	sessionHistoryReport,
	sessionHistoryRequestSeries,
} from "./session-history";
import { parseTranscript } from "./transcript";
import type { TranscriptLine } from "./transcript";

const LEADING_PARENT_TURN_COUNT = 1;

const NO_OBSERVED_DELIVERIES = 0;

const NO_INHERITED_TRANSCRIPT_LINES = 0;

function lineCount(transcript: string): number {
	return transcript.split("\n").length;
}

interface AgentTranscriptBoundary {
	readonly prefixLinesExcluded: number | undefined;
	readonly inherited: boolean;
}

function readings(
	input: Immutable<AgentTreeInput>,
	transcript: string,
	{ prefixLinesExcluded, inherited }: AgentTranscriptBoundary,
): AgentReadings {
	const series = sessionHistoryRequestSeries({
		prefixLinesExcluded,
		transcript,
	});
	const report = sessionHistoryReport({
		attempt: input.attempt,
		prefixLinesExcluded,
		resolvedCorpusFiles: input.resolvedCorpusFiles,
		transcript,
	});
	const sources = inherited ? report.startingSources : report.sources;
	const events = inherited ? report.startingContext : report.attemptEvents;
	const models = new Set(
		series.entries
			.map(({ model }) => model)
			.filter((model) => model !== undefined),
	);

	return {
		deliveries: sources.filter(
			({ observedDeliveryCount }) =>
				observedDeliveryCount !== NO_OBSERVED_DELIVERIES,
		),
		deliveryEvents: events.flatMap(
			({ id, sourceId, deliveryOrdinal, measurement }): AgentDelivery[] =>
				sourceId === undefined || deliveryOrdinal === undefined
					? []
					: [{ eventId: id, measurement, ordinal: deliveryOrdinal, sourceId }],
		),
		models: [...models],
		series,
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
			turns.push({ kind: userTurn, line });
		}
	}

	return turns.slice(LEADING_PARENT_TURN_COUNT);
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

	return inherited ? lineCount(file.transcript) : NO_INHERITED_TRANSCRIPT_LINES;
}

interface LinkedAgentEvidence {
	readonly file: Immutable<SubagentEvidence>;
	readonly link: Immutable<AgentLink>;
	readonly inherited: boolean;
}

function availableAgent(
	input: Immutable<AgentTreeInput>,
	{ file, link, inherited }: LinkedAgentEvidence,
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
		{
			inherited,
			prefixLinesExcluded: childPrefixLinesExcluded(input, file, inherited),
		},
	);

	return {
		agentId: file.agentId,
		agentType: meta.agentType,
		context,
		deliveries,
		deliveryEvents,
		description: meta.description,
		evidence: "available",
		laterTurns: laterTurns(lines),
		launchCallLine: link.callLine,
		launchMode: meta.launchMode,
		meta: meta.state,
		models,
		parent: link.parent,
		resume: RESUME_NOT_RECORDED,
		series,
		spawnDepth: meta.spawnDepth,
		stopped:
			meta.state === "recorded" ? meta.stoppedByUser === true : "not recorded",
	};
}

export { readings, laterTurns, availableAgent };
