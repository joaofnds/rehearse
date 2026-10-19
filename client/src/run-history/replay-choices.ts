import { isStopped, stoppedStageOf } from "#benchmark/stopped-status";
import type { ReplayChoice, ReplayableRun } from "#client/launch/launch-dialog";

import type { RunHistoryResponse } from "./run-history-query";

const FIRST_REPLAYABLE_RUN_INDEX = 0;

const FINAL_PIPELINE_STAGE_OFFSET = -1;

type HistoryRow = RunHistoryResponse["rows"][number];

type PipelineRunRow = Extract<HistoryRow, { readonly kind: "run" }>;

/** What the header's Replay a step can offer, or why it offers nothing. */
type ReplayOffer =
	| {
			readonly state: "available";
			/** Newest first. */
			readonly runs: readonly ReplayableRun[];
			readonly opensOn: ReplayChoice;
	  }
	| { readonly state: "unavailable"; readonly reason: string };

const NO_REPLAYABLE_STEP_REASON =
	"No recorded run has a step whose starting checkpoint is recorded";

function stoppedStage(row: PipelineRunRow): string | undefined {
	return isStopped(row.status) ? stoppedStageOf(row.status) : undefined;
}

/** A run opens on the step it stopped at when that step is offered, else on its last. */
function replayableRun(row: PipelineRunRow): ReplayableRun | undefined {
	const stages = row.replayableStages;
	const last = stages.at(FINAL_PIPELINE_STAGE_OFFSET);
	if (last === undefined) {
		return undefined;
	}

	const stopped = stoppedStage(row);

	return {
		caseId: row.caseId,
		openingStage:
			stopped !== undefined && stages.includes(stopped) ? stopped : last,
		run: row.run,
		stages,
	};
}

/**
 * The runs and steps the header's Replay a step offers, from rows listed
 * newest first. It opens on the newest stopped run's stopped step when that
 * step is offered, the step an operator most likely wants to replay, else on
 * the newest run that offers a step.
 */
function replayOffer(rows: readonly HistoryRow[]): ReplayOffer {
	const pipelineRuns = rows.filter(
		(row): row is PipelineRunRow => row.kind === "run",
	);
	const runs = pipelineRuns.flatMap((row) => {
		const replayable = replayableRun(row);

		return replayable === undefined ? [] : [replayable];
	});
	const newestStopped = pipelineRuns.find(
		(row) => stoppedStage(row) !== undefined,
	);
	const stoppedOpening = runs.find(
		({ run, openingStage }) =>
			run === newestStopped?.run &&
			openingStage === stoppedStage(newestStopped),
	);
	const opening = stoppedOpening ?? runs[FIRST_REPLAYABLE_RUN_INDEX];
	if (opening === undefined) {
		return { reason: NO_REPLAYABLE_STEP_REASON, state: "unavailable" };
	}

	return {
		opensOn: { run: opening.run, stage: opening.openingStage },
		runs,
		state: "available",
	};
}

export { NO_REPLAYABLE_STEP_REASON, replayOffer };
export type { ReplayOffer };
