import type { CorpusRoot } from "#benchmark/corpus-file";
import type { LaunchRecord } from "#benchmark/launch-record";
import type { OPERATOR_STOPPED } from "#benchmark/stopped-status";
import type { RowStaleness } from "#server/row-staleness";
import type { ConfirmationGroupRow } from "#server/run-history-group-contract";
import type {
	PipelineRunRow,
	ReplayRow,
	SessionAttemptRow,
} from "#server/run-history-saved-rows";

/**
 * A run, replay or group the browser started whose process is still alive
 * and which has no RUNNING row of its own yet: a replay and a group never
 * get one, and a pipeline run gets one only once its first stage starts.
 * Once the operator's stop ends the process, it stays listed as
 * OPERATOR_STOPPED. It
 * is listed apart from the rows, because it names a process rather than a
 * saved record, so it has no Record ID, short id, staleness or links.
 */
interface LaunchRow {
	readonly kind: "launch";
	readonly id: string;
	readonly target: LaunchRecord["kind"];
	readonly caseId: string | undefined;
	readonly run: string | undefined;
	readonly stage: string | undefined;
	readonly attempts: number;
	readonly launchedAt: string;
	readonly status: "RUNNING" | typeof OPERATOR_STOPPED;
}

/**
 * One run-history row, one per saved record an operator can open. This is
 * the single place that owns the read API's response shape for a run-history
 * row: no other card owns it.
 */
type RunHistoryRow =
	| PipelineRunRow
	| SessionAttemptRow
	| ReplayRow
	| ConfirmationGroupRow;

type Unjudged<Row extends RunHistoryRow> = Omit<Row, "staleness">;

/**
 * A run-history row without its staleness judgment, which costs most of the
 * report, for a reader that never shows staleness.
 */
type RunListingRow =
	| Unjudged<PipelineRunRow>
	| Unjudged<SessionAttemptRow>
	| Unjudged<ReplayRow>
	| Unjudged<ConfirmationGroupRow>;

/**
 * A saved record that failed to read, with the row kind it would have been,
 * or a short id registry, whose failure leaves only its own case's rows unnamed.
 */
interface UnreadableRecord {
	readonly incompleteConfirmation?: { readonly groupId: string };
	readonly kind: RunHistoryRow["kind"] | "launch" | "short-ids";
	readonly id: string;
	readonly reason: string;
}

interface RunHistoryReport {
	readonly rows: readonly RunHistoryRow[];
	/** Live browser launches, newest first. */
	readonly launches: readonly LaunchRow[];
	readonly unreadable: readonly UnreadableRecord[];
}

/** The run-history report with no row's staleness judged. */
interface RunListing {
	readonly rows: readonly RunListingRow[];
	/** Live browser launches, newest first. */
	readonly launches: readonly LaunchRow[];
	readonly unreadable: readonly UnreadableRecord[];
}

interface Staleness {
	readonly records: ReadonlyMap<string, RowStaleness>;
	readonly of: (recordId: string) => RowStaleness;
	/**
	 * A run row's staleness: the judgment of the stage its judge stopped, which
	 * stands under the run's own id, unavailable when that stage cannot be
	 * read, or else its latest checkpoint's.
	 */
	readonly ofRun: (run: string, latestCheckpoint: string) => RowStaleness;
}

interface RunHistoryCorpus {
	readonly runsDirectory: string;
	readonly source: CorpusRoot;
}

interface ListingReader<Named> {
	readonly idOf: (name: Named) => string;
	readonly read: (
		name: Named,
		shortId: string | undefined,
	) => Promise<RunListingRow | undefined>;
}

export type {
	LaunchRow,
	RunHistoryRow,
	Unjudged,
	RunListingRow,
	UnreadableRecord,
	RunHistoryReport,
	RunListing,
	Staleness,
	RunHistoryCorpus,
	ListingReader,
};
export type {
	PipelineRunRow,
	FiredBlockers,
	PipelineStages,
	ListedStageGrade,
	SessionAttemptRow,
	ReplayRow,
	NotApplicable,
	CheckpointShortId,
	RunFigures,
	RunLivenessContext,
	RunRowIdentity,
	RunRowLiveness,
	ReplayRowIdentity,
	ReplayRowIndexes,
} from "#server/run-history-saved-rows";
export type {
	ConfirmationGroupRow,
	SessionGroupSavedState,
	RepSavedState,
	RepAttempt,
	GroupRepReference,
	GroupRep,
	RepStageReading,
	GroupRowIdentity,
} from "#server/run-history-group-contract";
