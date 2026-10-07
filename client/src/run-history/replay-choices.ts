import { consumedCheckpointStage } from "#benchmark/consumed-checkpoint";
import { isStopped, stoppedStageOf } from "#benchmark/stopped-status";
import type { RunHistoryResponse } from "./run-history-query";

type HistoryRow = RunHistoryResponse["rows"][number];
type PipelineRunRow = Extract<HistoryRow, { readonly kind: "run" }>;

/** A pipeline run the operator can replay a step of. */
export interface ReplayableRun {
	readonly run: string;
	readonly caseId: string | undefined;
	/** Its steps whose starting checkpoint is recorded, in pipeline order. */
	readonly stages: readonly string[];
	/** The step chosen when this run is chosen. */
	readonly opensOn: string;
}

export interface ReplayChoice {
	readonly run: string;
	readonly stage: string;
}

export type ReplayChoices =
	| {
			readonly state: "available";
			/** Newest first. */
			readonly runs: readonly ReplayableRun[];
			readonly opensOn: ReplayChoice;
	  }
	| { readonly state: "unavailable"; readonly reason: string };

export const NO_REPLAYABLE_STEP_REASON =
	"No recorded run has a step whose starting checkpoint is recorded";

/**
 * A step is offered when the checkpoint its replay starts from is recorded,
 * the one rule the server's launch holds a replay to. A run whose stages
 * cannot be read, or that lists no checkpoints because it has no short id,
 * offers none.
 */
function replayableStages(row: PipelineRunRow): readonly string[] {
	if (row.stageGrades.state !== "available") {
		return [];
	}
	const recorded = new Set(row.checkpoints.map(({ stage }) => stage));
	const stages = row.stageGrades.grades.map(({ stage }) => stage);

	return stages.filter((_stage, index) =>
		recorded.has(consumedCheckpointStage(stages, index)),
	);
}

function offeredStoppedStage(
	row: PipelineRunRow,
	stages: readonly string[],
): string | undefined {
	if (!isStopped(row.status)) {
		return undefined;
	}
	const stopped = stoppedStageOf(row.status);

	return stages.includes(stopped) ? stopped : undefined;
}

interface Offer {
	readonly replayable: ReplayableRun;
	readonly stoppedStepOffered: boolean;
}

function offerOf(row: PipelineRunRow): Offer | undefined {
	const stages = replayableStages(row);
	const last = stages.at(-1);
	if (last === undefined) {
		return undefined;
	}
	const stopped = offeredStoppedStage(row, stages);

	return {
		replayable: {
			run: row.run,
			caseId: row.caseId,
			stages,
			opensOn: stopped ?? last,
		},
		stoppedStepOffered: stopped !== undefined,
	};
}

/**
 * The runs and steps the header's Replay a step offers, from rows listed
 * newest first. It opens on the newest stopped run's stopped step, the step
 * an operator most likely wants to replay, else on the newest run's last
 * offered step.
 */
export function replayChoices(rows: readonly HistoryRow[]): ReplayChoices {
	const offers = rows.flatMap((row) => {
		const offer = row.kind === "run" ? offerOf(row) : undefined;

		return offer === undefined ? [] : [offer];
	});
	const opening =
		offers.find(({ stoppedStepOffered }) => stoppedStepOffered) ?? offers[0];
	if (opening === undefined) {
		return { state: "unavailable", reason: NO_REPLAYABLE_STEP_REASON };
	}

	return {
		state: "available",
		runs: offers.map(({ replayable }) => replayable),
		opensOn: {
			run: opening.replayable.run,
			stage: opening.replayable.opensOn,
		},
	};
}
