import type { Effort } from "./config";
import type { Immutable } from "./contracts";
import type { TranscriptDiagnostics, TranscriptLocation } from "./transcript";

const SESSION_HISTORY_SCHEMA_VERSION = 1;

type HistoryRegion = "starting-context" | "attempt" | "boundary-unknown";

type HistorySourceKind =
	| "corpus"
	| "project"
	| "external"
	| "skill"
	| "tool-output"
	| "unclassified";

type HistoryEventKind =
	| "call"
	| "result"
	| "instruction-delivery"
	| "unclassified";

type HistoryEventState =
	| "invoked"
	| "delivered"
	| "recorded"
	| "failed"
	| "partial"
	| "unavailable";

type HistoryEvidence =
	| { readonly state: "complete" }
	| { readonly state: "partial"; readonly reasons: readonly string[] }
	| { readonly state: "unavailable"; readonly reasons: readonly string[] };

type TextMeasurement =
	| { readonly state: "complete"; readonly characters: number }
	| {
			readonly state: "partial";
			readonly observedCharacters: number;
			readonly reasons: readonly string[];
	  }
	| { readonly state: "unavailable"; readonly reasons: readonly string[] };

interface SessionHistoryEvent {
	readonly id: string;
	readonly locator: TranscriptLocation;
	readonly region: HistoryRegion;
	readonly kind: HistoryEventKind;
	readonly state: HistoryEventState;
	readonly label: string;
	readonly timestamp?: string | undefined;
	readonly toolUseId?: string | undefined;
	readonly toolName?: string | undefined;
	readonly sourceId?: string | undefined;
	readonly measurement: TextMeasurement;
	readonly relatedEventIds: readonly string[];
	readonly deliveryOrdinal?: number | undefined;
}

interface SessionHistorySource {
	readonly id: string;
	readonly kind: HistorySourceKind;
	readonly name: string;
	readonly path?: string | undefined;
	readonly region: HistoryRegion;
	readonly firstLocator: TranscriptLocation;
	readonly measurement: TextMeasurement;
	readonly observedDeliveryCount: number | undefined;
	readonly repeatDeliveryCount: number | undefined;
	readonly failedOccurrences: number;
	readonly partialOccurrences: number;
	readonly missingOccurrences: number;
	readonly unavailableOccurrences: number;
	readonly eventIds: readonly string[];
}

/**
 * A saved standalone or confirmation session attempt, identified by the case it
 * ran and its own attempt id.
 */
interface SessionAttemptIdentity {
	readonly kind: "session";
	readonly caseId: string;
	readonly id: string;
	readonly model: string;
	readonly outcome: string;
	readonly corpusFiles: readonly {
		readonly path: string;
		readonly resolvedPath: string;
	}[];
}

/**
 * One pipeline stage at its checkpoint. A checkpoint records no attempt id and
 * no outcome, since it exists only for a stage that passed its grade, so the
 * run and stage name it and the lineage places it among the other stages. A
 * stage that stopped the run has no checkpoint and takes the identity below.
 * Its declared corpus files carry hashes rather than resolved paths.
 */
interface StageHistoryIdentity {
	readonly kind: "stage";
	readonly caseId: string;
	readonly run: string;
	readonly stage: string;
	readonly lineage: string;
	readonly upstream: string;
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly corpusFiles: readonly {
		readonly path: string;
		readonly sha256: string;
	}[];
}

/**
 * One pipeline stage the run ended on, whether its grade fell short, its
 * judging failed, or a signal stopped it. It writes no checkpoint, so nothing
 * records a lineage for it and the run and stage name it alone. Only the
 * error the harness recorded says which cause it was, so it is carried as its
 * own field rather than folded into the evidence reason, which every other
 * cause states in a sentence this project authored.
 */
interface StoppedStageHistoryIdentity {
	readonly kind: "stopped-stage";
	readonly caseId: string;
	readonly run: string;
	readonly stage: string;
	readonly error: string;
	readonly model: string;
	readonly corpusFiles: readonly {
		readonly path: string;
		readonly sha256: string;
	}[];
}

/**
 * One pipeline stage whose session finished and whose judging never completed,
 * because the run died between the two writes. It writes no checkpoint, so it
 * has no lineage, and it records no error, because nothing failed: the run
 * simply stopped before a verdict existed. The run and stage name it alone.
 */
interface AwaitingJudgeStageHistoryIdentity {
	readonly kind: "awaiting-judge-stage";
	readonly caseId: string;
	readonly run: string;
	readonly stage: string;
	readonly model: string;
	readonly corpusFiles: readonly {
		readonly path: string;
		readonly sha256: string;
	}[];
}

type SessionHistoryAttemptIdentity =
	| SessionAttemptIdentity
	| StageHistoryIdentity
	| StoppedStageHistoryIdentity
	| AwaitingJudgeStageHistoryIdentity;

/**
 * The corpus files whose bytes were resolved to a real path before the session
 * ran. A saved session attempt records them; a pipeline stage does not, and
 * supplies an empty list, which is what routes its reads to the corpus layout
 * rule below rather than to the exact-path match.
 */
interface CorpusFileLocation {
	readonly path: string;
	readonly resolvedPath: string;
}

/**
 * Why no raw transcript backs this report. Each cause is a different fact
 * about the record, so an operator reading "unavailable" learns which one
 * rather than being left to assume the provider failed.
 *
 * A stage the run stopped on is one of them. It writes no checkpoint and no
 * transcript, and the stop record it leaves instead carries the reason on the
 * identity rather than here, since a grade and a signal both write this record
 * and only that text tells them apart.
 *
 * A stage whose judging never completed is another. Its record names no cause
 * because none is recorded: the run ended before a verdict existed, so the
 * sentence here is the whole of what is known.
 */
type HistoryUnavailableReason =
	| "provider-wrote-none"
	| "no-capture-recorded"
	| "recorded-transcript-missing"
	| "replay-retains-none"
	| "stage-stopped"
	| "stage-judging-never-completed";

interface SessionHistoryReportInput {
	readonly attempt: SessionHistoryAttemptIdentity;
	readonly resolvedCorpusFiles: readonly CorpusFileLocation[];
	readonly unavailableReason?: HistoryUnavailableReason | undefined;
	readonly transcript: string | undefined;
	readonly prefixLinesExcluded: number | undefined;
	readonly diagnostics?: Immutable<TranscriptDiagnostics> | undefined;
}

type SessionHistoryReportMetadata = Omit<
	SessionHistoryReportInput,
	"transcript"
>;

interface SessionHistoryReport {
	readonly schemaVersion: typeof SESSION_HISTORY_SCHEMA_VERSION;
	readonly attempt: SessionHistoryAttemptIdentity;
	readonly evidence: HistoryEvidence;
	readonly boundary: "known" | "unknown";
	readonly startingContext: readonly SessionHistoryEvent[];
	readonly attemptEvents: readonly SessionHistoryEvent[];
	readonly boundaryUnknown: readonly SessionHistoryEvent[];
	readonly startingSources: readonly SessionHistorySource[];
	readonly sources: readonly SessionHistorySource[];
	readonly diagnostics?: Immutable<TranscriptDiagnostics> | undefined;
}

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
};

export { SESSION_HISTORY_SCHEMA_VERSION as default };
