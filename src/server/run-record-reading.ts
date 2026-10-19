import type { HashedFile } from "#benchmark/checkpoint";
import type {
	FinalOutcome,
	PathsReading,
	PlacedStage,
	Reading,
	RunRecordStage,
	StagePlace,
} from "#server/run-record-contract";
import {
	MISSING_STAGE_RECORD_REASON,
	UNREACHED_STAGE_REASON,
	UNRECORDED_STAGE_REASON,
} from "#server/run-record-reasons";

const COMPLETED_OUTCOME_STAGE_INDEX = -1;

const UNLOCATED_OUTCOME_STAGE_INDEX = -1;

function wallTime(
	ms: number | undefined,
	reason: string,
): Reading<{ readonly ms: number }> {
	if (ms === undefined) {
		return { reasons: [reason], state: "unavailable" };
	}

	return { ms, state: "available" };
}

function filesOf(
	files: readonly HashedFile[] | undefined,
): RunRecordStage["instructionFiles"] {
	if (files === undefined) {
		return {
			reasons: [
				"neither a checkpoint nor the stage record lists the stage's corpus files",
			],
			state: "unavailable",
		};
	}

	return { files, state: "available" };
}

function pathsOf(
	files: readonly { readonly path: string }[] | undefined,
	absent: string,
): PathsReading {
	if (files === undefined) {
		return { reasons: [absent], state: "unavailable" };
	}

	return { paths: files.map(({ path }) => path), state: "available" };
}

/**
 * The index among the stage names given of the stage the run ended or is
 * running in, or -1 when its outcome names none of them.
 */
function currentStageIndex(
	stages: readonly string[],
	outcome: FinalOutcome,
): number {
	if (outcome.status !== "NOT_REACHED" && outcome.status !== "PENDING") {
		return COMPLETED_OUTCOME_STAGE_INDEX;
	}

	return outcome.stage === undefined
		? UNLOCATED_OUTCOME_STAGE_INDEX
		: stages.indexOf(outcome.stage);
}

function stagePlace(index: number, currentIndex: number): StagePlace {
	if (index === currentIndex) {
		return "current";
	}

	if (currentIndex !== COMPLETED_OUTCOME_STAGE_INDEX && index > currentIndex) {
		return "unreached";
	}

	return "elsewhere";
}

const UNRECORDED_REASONS = {
	current: UNRECORDED_STAGE_REASON,
	elsewhere: MISSING_STAGE_RECORD_REASON,
	unreached: UNREACHED_STAGE_REASON,
} as const satisfies Record<StagePlace, string>;

/** Why a stage's figure is missing: its record lacks it, or it wrote none. */
function unrecordedOr({ file, place }: PlacedStage, reason: string): string {
	return file === undefined ? UNRECORDED_REASONS[place] : reason;
}

export {
	wallTime,
	filesOf,
	pathsOf,
	currentStageIndex,
	stagePlace,
	UNRECORDED_REASONS,
	unrecordedOr,
};
