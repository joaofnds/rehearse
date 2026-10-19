import { STAGE_LETTER_GRADES } from "#benchmark/config";
import type { StageLetterGrade } from "#benchmark/config";
import type { GradedHardBlockers } from "#benchmark/contracts";
import { letterReachesMinimum } from "#benchmark/stage-grade";
import {
	sessionCost,
	stageJudgeCost,
	stageTokenParts,
	tokenReading,
} from "#server/run-call-metrics";
import type {
	ArtifactsIn,
	CheckpointsByLineage,
	PlacedStage,
	RecordedStage,
	RunRecordStage,
	ShortIdReading,
	StageStatus,
	TokenReading,
} from "#server/run-record-contract";
import {
	UNRECORDED_REASONS,
	filesOf,
	pathsOf,
	unrecordedOr,
	wallTime,
} from "#server/run-record-reading";
import {
	AWAITING_GRADE_REASON,
	STOPPED_GRADE_REASON,
	UNGRADED_BLOCKERS_REASON,
	WALL_TIME_REASON,
} from "#server/run-record-reasons";
import type { StageFile } from "#server/run-stage-file";
import stageStatus from "#server/run-stage-status";
import { workflowStateChanges } from "#server/run-workflow-artifacts";

const EMPTY_COLLECTION_LENGTH = 0;

const UNGRADED_REASONS = {
	"awaiting-judgment": AWAITING_GRADE_REASON,
	graded: "the scorecard holds no letter",
	stopped: STOPPED_GRADE_REASON,
} as const satisfies Record<Exclude<StageStatus, "no-record">, string>;

function ungradedReason(recorded: PlacedStage): string {
	const status = stageStatus(recorded.file);

	return status === "no-record"
		? UNRECORDED_REASONS[recorded.place]
		: UNGRADED_REASONS[status];
}

/**
 * A stage's tokens, or why it has none: a stage that wrote no record and did
 * not spend has no part to sum.
 */
function stageTokens(recorded: PlacedStage): TokenReading {
	const parts = stageTokenParts(recorded);

	return parts.length === EMPTY_COLLECTION_LENGTH
		? { reasons: [UNRECORDED_REASONS[recorded.place]], state: "unavailable" }
		: tokenReading(parts);
}

function firedBlockerIds(hardBlockers: GradedHardBlockers): readonly string[] {
	return hardBlockers
		.filter(({ status }) => status === "FAIL")
		.map(({ id }) => id);
}

/** The hard blockers a scorecard keeps in its grade, or a stop record beside it. */
function recordedHardBlockers(
	file: StageFile | undefined,
): GradedHardBlockers | undefined {
	return file?.grade?.hardBlockers ?? file?.hardBlockers;
}

function blockersOf(recorded: PlacedStage): RunRecordStage["blockers"] {
	const hardBlockers = recordedHardBlockers(recorded.file);
	if (hardBlockers === undefined) {
		return {
			reasons: [unrecordedOr(recorded, UNGRADED_BLOCKERS_REASON)],
			state: "unavailable",
		};
	}

	const firedIds = firedBlockerIds(hardBlockers);

	return {
		fired: firedIds.length,
		firedIds,
		state: "available",
		total: hardBlockers.length,
	};
}

/** The corpus a stage ran under, from its checkpoint or, failing one, its record. */
function ranUnder({
	file,
	checkpoint,
}: RecordedStage): Pick<RunRecordStage, "instructionFiles" | "corpusVersion"> {
	return {
		corpusVersion: checkpoint?.corpusVersion ?? file?.corpusVersion,
		instructionFiles: filesOf(checkpoint?.corpusFiles ?? file?.corpusFiles),
	};
}

function readManifestOf({
	file,
	checkpoint,
}: RecordedStage): RunRecordStage["readManifest"] {
	const recorded = checkpoint?.readManifest ?? file?.readManifest;
	if (recorded !== undefined) {
		return { entries: recorded, state: "available" };
	}

	if (checkpoint === undefined) {
		return {
			reasons: ["the stage saved no checkpoint"],
			state: "unavailable",
		};
	}

	return {
		reasons: ["the checkpoint was recorded before read manifests"],
		state: "unavailable",
	};
}

/**
 * A letter outside the gate's scale has no place against the minimum, so it
 * falls back to its judge's verdict.
 */
function reachesMinimum(
	grade: { readonly grade: string; readonly verdict: string },
	minimumGrade: StageLetterGrade | undefined,
): boolean {
	const letter = STAGE_LETTER_GRADES.find((each) => each === grade.grade);

	return letter === undefined
		? grade.verdict !== "STOP"
		: letterReachesMinimum(letter, minimumGrade);
}

interface StageRecordContext {
	readonly checkpoints: CheckpointsByLineage;
	readonly checkpointShortId: ShortIdReading;
	readonly minimumGrade: StageLetterGrade | undefined;
	readonly inputs: ArtifactsIn;
}

function stageRecord(
	recorded: PlacedStage,
	{ checkpoints, checkpointShortId, minimumGrade, inputs }: StageRecordContext,
): RunRecordStage {
	const { file, checkpoint } = recorded;

	return {
		blockers: blockersOf(recorded),
		checkpoint: checkpoint === undefined ? "missing" : "recorded",
		checkpointShortId,
		grade:
			file?.grade === undefined
				? {
						reasons: [ungradedReason(recorded)],
						state: "unavailable",
					}
				: {
						letter: file.grade.grade,
						reachesMinimum: reachesMinimum(file.grade, minimumGrade),
						state: "available",
						verdict: file.grade.verdict,
					},
		judgeCost: stageJudgeCost(recorded),
		sessionCost: sessionCost(recorded),
		stage: recorded.stage,
		status: stageStatus(file),
		tokens: stageTokens(recorded),
		wallTime: wallTime(
			file?.elapsedMs,
			stageStatus(file) === "awaiting-judgment"
				? AWAITING_GRADE_REASON
				: unrecordedOr(recorded, WALL_TIME_REASON),
		),
		...ranUnder(recorded),
		artifactsIn: inputs,
		artifactsOut: stageArtifacts(recorded, checkpoints),
		readManifest: readManifestOf(recorded),
	};
}

function stageArtifacts(
	{ file, checkpoint }: PlacedStage,
	checkpoints: CheckpointsByLineage,
): RunRecordStage["artifactsOut"] {
	const commitSubjects = file?.input?.commitSubjects;
	const changedPaths = file?.input?.changedPaths;

	return {
		changedPaths:
			changedPaths === undefined
				? {
						reasons: ["the stage record holds no changed paths"],
						state: "unavailable",
					}
				: { paths: changedPaths, state: "available" },
		commitSubjects:
			commitSubjects === undefined
				? {
						reasons: ["the stage record holds no commit subjects"],
						state: "unavailable",
					}
				: { state: "available", subjects: commitSubjects },
		declared: pathsOf(
			checkpoint?.artifacts,
			"the stage saved no checkpoint to declare its artifact",
		),
		workflowState: workflowStateChanges(checkpoint, checkpoints),
	};
}

export { firedBlockerIds, recordedHardBlockers, stageRecord };
export { default as stageStatus } from "#server/run-stage-status";
