import type { Immutable } from "./contracts";
import { isCorpusLayoutPath } from "./corpus-file";
import SESSION_HISTORY_SCHEMA_VERSION from "./session-history-contract";
import type {
	HistoryUnavailableReason,
	SessionHistoryReport,
	SessionHistoryReportInput,
	SessionHistoryReportMetadata,
} from "./session-history-contract";
import joinEvents from "./session-history-deliveries";
import type { ProjectionState } from "./session-history-event-contract";
import {
	HistoryTranscriptProjection,
	parseEvents,
} from "./session-history-row-events";
import { publicEvent, sourcesFor } from "./session-history-source-summary";
import type { TranscriptLocation } from "./transcript";

const EMPTY_COLLECTION_LENGTH = 0;

const UNAVAILABLE_REASON_TEXT = {
	"no-capture-recorded":
		"no raw transcript capture was recorded for this stage",
	"provider-wrote-none":
		"the provider wrote no transcript for this stage session",
	"recorded-transcript-missing":
		"the checkpoint records a transcript whose file is no longer beside it",
	"replay-retains-none":
		"a replay retains no raw transcript for its stage session",
	"stage-judging-never-completed":
		"this stage ran and its judging never completed, so no transcript was recorded",
	"stage-stopped": "this stage stopped before recording a transcript",
} satisfies Record<HistoryUnavailableReason, string>;

function missingTranscriptReport(
	input: Immutable<SessionHistoryReportMetadata>,
): SessionHistoryReport {
	const reason =
		input.unavailableReason === undefined
			? "transcript unavailable"
			: UNAVAILABLE_REASON_TEXT[input.unavailableReason];

	return {
		attempt: input.attempt,
		attemptEvents: [],
		boundary: input.prefixLinesExcluded === undefined ? "unknown" : "known",
		boundaryUnknown: [],
		diagnostics: input.diagnostics,
		evidence: { reasons: [reason], state: "unavailable" },
		schemaVersion: SESSION_HISTORY_SCHEMA_VERSION,
		sources: [],
		startingContext: [],
		startingSources: [],
	};
}

function reportFromProjection(
	input: Immutable<SessionHistoryReportMetadata>,
	projection: Immutable<ProjectionState>,
): SessionHistoryReport {
	let state = joinEvents(projection);
	if (state.events.length === EMPTY_COLLECTION_LENGTH) {
		state = { ...state, issues: [...state.issues, "empty transcript"] };
	}
	if (input.prefixLinesExcluded === undefined) {
		state = {
			...state,
			issues: [...state.issues, "attempt boundary unavailable"],
		};
	}
	if (input.diagnostics?.state === "partial") {
		state = {
			...state,
			issues: [
				...state.issues,
				...input.diagnostics.issues.map(({ kind }) => kind),
			],
		};
	}

	return {
		attempt: input.attempt,
		attemptEvents: state.events
			.filter(({ region }) => region === "attempt")
			.map((event) => publicEvent(event)),
		boundary: input.prefixLinesExcluded === undefined ? "unknown" : "known",
		boundaryUnknown: state.events
			.filter(({ region }) => region === "boundary-unknown")
			.map((event) => publicEvent(event)),
		diagnostics: input.diagnostics,
		evidence:
			state.issues.length === EMPTY_COLLECTION_LENGTH
				? { state: "complete" }
				: { reasons: [...new Set(state.issues)], state: "partial" },
		schemaVersion: SESSION_HISTORY_SCHEMA_VERSION,
		sources: [
			...sourcesFor(state.events, "attempt"),
			...sourcesFor(state.events, "boundary-unknown"),
		],
		startingContext: state.events
			.filter(({ region }) => region === "starting-context")
			.map((event) => publicEvent(event)),
		startingSources: sourcesFor(state.events, "starting-context"),
	};
}

/**
 * What a stage's declared corpus and its transcript say about each other. The
 * only key the two sides share is the corpus layout path: a declaration
 * carries a hash of bytes on disk, and a transcript carries the text that was
 * delivered, so a hash can never establish that a file entered context.
 *
 * "No observation recorded" is not absence from context. A stage that kept no
 * transcript records nothing about every file it declared.
 */
type StageCorpusState = "observed" | "no-observation-recorded" | "undeclared";

interface StageCorpusEntry {
	readonly path: string;
	readonly state: StageCorpusState;
	readonly firstLocator?: TranscriptLocation | undefined;
}

function stageCorpusReconciliation(
	report: Immutable<SessionHistoryReport>,
): readonly StageCorpusEntry[] {
	if (
		report.attempt.kind !== "stage" &&
		report.attempt.kind !== "stopped-stage" &&
		report.attempt.kind !== "awaiting-judge-stage"
	) {
		return [];
	}

	const observed = new Map(
		[...report.startingSources, ...report.sources]
			.filter(({ kind, name }) => kind === "corpus" && isCorpusLayoutPath(name))
			.map((source) => [source.name, source.firstLocator]),
	);
	const declared = report.attempt.corpusFiles.map(({ path }) => {
		const firstLocator = observed.get(path);

		return firstLocator === undefined
			? { path, state: "no-observation-recorded" as const }
			: { firstLocator, path, state: "observed" as const };
	});
	const declaredPaths = new Set(declared.map(({ path }) => path));
	const undeclared = [...observed.entries()]
		.filter(([path]) => !declaredPaths.has(path))
		.map(([path, firstLocator]) => ({
			firstLocator,
			path,
			state: "undeclared" as const,
		}));

	return [...declared, ...undeclared];
}

function sessionHistoryReport(
	input: Immutable<SessionHistoryReportInput>,
): SessionHistoryReport {
	return input.transcript === undefined
		? missingTranscriptReport(input)
		: reportFromProjection(input, parseEvents(input, false));
}

async function sessionHistoryReportFromLines(
	input: Immutable<SessionHistoryReportMetadata>,
	lines: AsyncIterable<string>,
): Promise<SessionHistoryReport> {
	const projection = new HistoryTranscriptProjection(input);
	for await (const text of lines) {
		projection.observe(text);
	}
	return reportFromProjection(input, projection.state());
}

export {
	MAX_EVENT_DETAIL_BYTES,
	sessionHistoryDetail,
	sessionHistoryDetailFromLine,
} from "./session-history-detail";

export {
	sessionHistoryRequestSeries,
	sessionHistoryRequestSeriesFromLines,
} from "./session-history-requests";

export {
	attemptCostOverAgents,
	sessionHistoryRequestCosts,
	sessionHistoryAttemptCost,
} from "./session-history-cost";

export type {
	HistoryRegion,
	HistorySourceKind,
	HistoryEventKind,
	HistoryEventState,
	HistoryEvidence,
	TextMeasurement,
	SessionHistoryEvent,
	SessionHistorySource,
	SessionAttemptIdentity,
	StageHistoryIdentity,
	StoppedStageHistoryIdentity,
	AwaitingJudgeStageHistoryIdentity,
	SessionHistoryAttemptIdentity,
	CorpusFileLocation,
	HistoryUnavailableReason,
	SessionHistoryReportInput,
	SessionHistoryReportMetadata,
	SessionHistoryReport,
} from "./session-history-contract";

export type { SessionHistoryDetail } from "./session-history-detail";

export type { SourceSnapshotRange } from "./session-history-snapshots";

export type {
	SessionHistoryRequestUsage,
	SessionHistoryCacheWriteSplit,
	SessionHistoryRequestEntry,
	SessionHistoryAttemptTotals,
	SessionHistoryRequestSeries,
	SessionHistoryCompaction,
	SessionHistoryRequestSeriesInput,
	SessionHistoryRequestSeriesMetadata,
} from "./session-history-request-contract";

export type {
	SessionHistoryCostReading,
	SessionHistoryAttemptCost,
	SessionHistoryAttemptCostInput,
	SessionHistoryRequestCost,
} from "./session-history-cost";

export {
	stageCorpusReconciliation,
	sessionHistoryReport,
	sessionHistoryReportFromLines,
};

export type { StageCorpusState, StageCorpusEntry };
