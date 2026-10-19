import type {
	ConfirmationMode,
	ParsedConfirmationRepRecord,
} from "#benchmark/confirmation-record";
import type { Immutable } from "#benchmark/contracts";
import type { CorpusMeasurement } from "#benchmark/corpus-measurement";
import type { AttemptPosition } from "#server/checkpoint-attempts";
import type {
	GroupStageSummary,
	RepCounts,
	UnreadRep,
} from "#server/confirmation-group-summary";
import type { RowStaleness } from "#server/row-staleness";
import type {
	FiredBlockers,
	PipelineStages,
} from "#server/run-history-saved-rows";
import type { CostReading, WallTimeReading } from "#server/run-record";
import type { ContextLink } from "#server/run-status";
import type { SavedStateAssessment } from "#server/saved-state-assessment";

/**
 * One confirmation group, listed once rather than once per rep: its reps are
 * links, since a rep is evidence of the group rather than a run of its own.
 */
interface ConfirmationGroupRow {
	/** The id `lastEdit.rows` and the `ids` filter name the record by. */
	readonly recordId: string;
	readonly kind: "group";
	readonly groupId: string;
	readonly shortId: string | undefined;
	readonly caseId: string;
	readonly mode: ConfirmationMode;
	/** When the group started; undefined for a record written before groups recorded it. */
	readonly startedAt: string | undefined;
	/** The checkpoint a replayed group ran from, which only its claim records. */
	readonly checkpoint:
		| { readonly run: string; readonly stage: string }
		| undefined;
	readonly reps: number;
	readonly corpusVersion: CorpusMeasurement | undefined;
	readonly staleness: RowStaleness;
	readonly repAttempts: readonly RepAttempt[];
	readonly links: readonly ContextLink[];
	readonly stageSummaries: readonly GroupStageSummary[];
	readonly finalOutcomes: RepCounts;
	/** Of `reps` requested, how many the group recorded as successful. */
	readonly successful: number;
	/** Reps with a recorded rejected step/check or final FAIL; excludes unjudged errors. */
	readonly qualityFailures: number;
	/** Each rep the server could not read, which no other figure counts. */
	readonly unreadReps: readonly UnreadRep[];
	readonly cost: CostReading;
	readonly wallTime: WallTimeReading;
	/** The stages of the pipeline its declared stages sit among. */
	readonly pipelineStages: PipelineStages;
	readonly firedBlockers: FiredBlockers;
	/** Session attempts' saved-state layer, independent of the group's recorded outcomes. */
	readonly savedState?: SessionGroupSavedState | undefined;
}

interface SessionGroupSavedState {
	readonly total: number;
	readonly assessed: number;
	readonly passed: number;
	readonly failed: number;
	readonly unavailable: number;
	readonly disagreements: number;
	readonly unavailableReps: readonly {
		readonly repId: string;
		readonly reason: string;
	}[];
}

interface RepSavedState {
	readonly repId: string;
	readonly assessment: SavedStateAssessment;
	readonly recordedPassed: boolean | undefined;
}

interface RepAttempt {
	readonly repId: string;
	readonly attempt: AttemptPosition;
}

interface GroupRepReference {
	readonly groupId: string;
	readonly mode: ConfirmationMode;
	readonly reference: { readonly repId: string; readonly ordinal: number };
}

type GroupRep = Immutable<ParsedConfirmationRepRecord> | UnreadRep;

type RepStageReading =
	| { readonly state: "read"; readonly fired: FiredBlockers }
	| { readonly state: "unreadable"; readonly reason: string };

interface GroupRowIdentity {
	readonly groupId: string;
	readonly shortId: string | undefined;
	readonly checkpoint: ConfirmationGroupRow["checkpoint"];
}

export type {
	ConfirmationGroupRow,
	SessionGroupSavedState,
	RepSavedState,
	RepAttempt,
	GroupRepReference,
	GroupRep,
	RepStageReading,
	GroupRowIdentity,
};
