import type { JudgeProgress } from "#benchmark/run-events";
import type { RunTokens } from "#benchmark/spend-ceiling";
import type {
	SPEND_SCOPE,
	STAGE_STATE,
} from "#server/run-status-live-progress";

type SpendScope = (typeof SPEND_SCOPE)[keyof typeof SPEND_SCOPE];

type StageState = (typeof STAGE_STATE)[keyof typeof STAGE_STATE];

/**
 * A run's live readings, present together or not at all. A finished run has
 * none of them, and a running one has all of them, so they sit behind one
 * discriminant rather than as separate fields a reader could find half-filled.
 * The executing stage is here rather than on the row's own `stage`, which
 * means the last checkpoint recorded and drives the grade, digest, and
 * staleness readings: the stage now executing has written no checkpoint yet.
 *
 * `elapsedMs` is the figure the run itself measured, and `measuredAt` says
 * when. A run emits an event once per agent turn, minutes apart, so a reader
 * rendering `elapsedMs` alone would show a clock that stops between turns.
 * The pair lets it keep running without this reader inventing a number the
 * run never recorded. `stageElapsedMs` is the same figure measured from the
 * running stage's own start event, and undefined when the stream holds no
 * start for that stage.
 *
 * `judge` is the stage judge's latest progress reading, present only while
 * that reading is the run's latest event: how many of each rubric section's
 * items are back, or the attempt it rejected, before the stage grade exists.
 *
 * `runSpentUsd` is what the run's ceiling had charged at its latest event,
 * and `ceilingUsd` the ceiling its manifest says it started under, which a
 * later change to the stored ceiling does not move. `runTokens` is the
 * run's tokens in and out tallied with `runSpentUsd`. Each is undefined for a
 * run recorded before it existed.
 */
type RunProgress =
	| { readonly state: "recorded" }
	| {
			readonly state: "running";
			readonly stage: string;
			readonly stageState: StageState;
			readonly elapsedMs: number;
			readonly stageElapsedMs: number | undefined;
			readonly measuredAt: string;
			readonly spentUsd: number;
			readonly spendScope: SpendScope;
			readonly runSpentUsd: number | undefined;
			readonly runTokens: RunTokens | undefined;
			readonly ceilingUsd: number | undefined;
			readonly judge?: JudgeProgress;
	  };

/**
 * Where a row's saved context opens, or why it cannot. A link is built only
 * from the record's own recorded identity, never derived, so it cannot open a
 * sibling's evidence; a record whose context has no page says so instead of
 * linking to one that would fail.
 */
type ContextLink =
	| {
			readonly state: "available";
			readonly label: string;
			readonly href: string;
	  }
	| {
			readonly state: "unavailable";
			readonly label: string;
			readonly reason: string;
	  };

interface RunIdentity {
	readonly status: string;
	readonly caseId: string | undefined;
	readonly gradeByStage: ReadonlyMap<string, string>;
	readonly progress: RunProgress;
	readonly links: readonly ContextLink[];
}

/** A run whose saved records do not describe a readable history row. */
class IncompleteRunRecordError extends Error {
	public override readonly name = "IncompleteRunRecordError";
}

export { IncompleteRunRecordError as default };
export type { RunProgress, ContextLink, RunIdentity };
