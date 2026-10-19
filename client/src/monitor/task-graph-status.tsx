import {
	isPaused,
	isStopped,
	pausedStageOf,
	stoppedStageOf,
} from "#benchmark/stopped-status";
import { hasRunEnded } from "#client/run-history/run-status";
import type { PipelineRow } from "#client/shell/run-in-flight";
import type { StatusState } from "#client/system/components/status";
import { STATUS_VOCABULARY } from "#client/system/components/status";

import type { MonitoredStage, RunRecordResponse } from "./run-record-query";
import { continuationReading, endedStatus, hasEnded } from "./run-record-query";

const MISSING_STOPPED_STAGE_INDEX = -1;

interface NodeStatus {
	readonly state: StatusState;
	readonly words: string;
}

type RunningProgress = Extract<
	PipelineRow["progress"],
	{ readonly state: "running" }
>;

/**
 * The run's progress when it is this stage's to show. A judged stage stays the
 * run's latest until the next one starts, but once its record is written the
 * record says how it ended, what it cost and how long it took.
 */
function liveProgress(
	stage: MonitoredStage,
	row: PipelineRow,
): RunningProgress | undefined {
	const { progress } = row;

	return progress.state === "running" &&
		progress.stage === stage.stage &&
		stage.status !== "graded"
		? progress
		: undefined;
}

function isRunning(stage: MonitoredStage, row: PipelineRow): boolean {
	return liveProgress(stage, row) !== undefined;
}

/** A stage the run has not reached: no record, and not the one running. */
function notStarted(stage: MonitoredStage, row: PipelineRow): boolean {
	return stage.status === "no-record" && !isRunning(stage, row);
}

/** A recorded boundary proves that subsequent steps never ran. */
function stoppedAfter(status: string): string | undefined {
	if (isStopped(status)) {
		return stoppedStageOf(status);
	}
	if (isPaused(status)) {
		return pausedStageOf(status);
	}
	return undefined;
}

function nodeStatus(
	stage: MonitoredStage,
	row: PipelineRow,
	record: RunRecordResponse,
): NodeStatus {
	const progress = liveProgress(stage, row);
	if (progress !== undefined) {
		return { state: "running", words: progress.stageState };
	}
	if (hasEnded(stage)) {
		const ended = endedStatus(stage);

		return {
			state: ended,
			words:
				ended === "accepted"
					? continuationReading(record.minimumGrade)
					: STATUS_VOCABULARY[ended].word,
		};
	}
	if (stage.status === "awaiting-judgment") {
		return hasRunEnded(row)
			? { state: "interrupted", words: "judge never returned" }
			: { state: "pending", words: "awaiting judgment" };
	}
	return unrecordedNodeStatus(stage, row, record);
}

function unrecordedNodeStatus(
	stage: MonitoredStage,
	row: PipelineRow,
	record: RunRecordResponse,
): NodeStatus {
	if (hasRunEnded(row)) {
		const stopped = stoppedAfter(row.status);
		const stoppedIndex = record.stages.findIndex(
			(each) => each.stage === stopped,
		);
		const index = record.stages.indexOf(stage);
		return stoppedIndex !== MISSING_STOPPED_STAGE_INDEX && index > stoppedIndex
			? { state: "queued", words: "never ran" }
			: { state: "interrupted", words: "step record missing" };
	}

	return { state: "queued", words: STATUS_VOCABULARY.queued.word };
}

export { isRunning, liveProgress, nodeStatus, notStarted };
export type { NodeStatus, RunningProgress };
