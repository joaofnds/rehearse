import {
	OPERATOR_STOPPED,
	isPaused,
	isStopped,
	stoppedStageOf,
} from "#benchmark/stopped-status";
import minutesAndSeconds from "#client/monitor/minutes-and-seconds";
import type {
	MonitoredStage,
	RunRecordResponse,
} from "#client/monitor/run-record-query";
import { missedMinimum } from "#client/monitor/run-record-query";
import type { RunListingResponse } from "#client/run-history/run-history-query";
import { spendReading } from "#client/run-history/run-progress";

import momentReading from "./moment-reading";

const INITIAL_RECORDED_STAGE_INDEX = 0;

const NO_SELECTED_STAGE_NUMBER = 0;

const STAGE_NUMBER_BASE = 1;

type PipelineRow = Extract<HistoryRow, { readonly kind: "run" }>;

const NOT_RECORDED = "—";

type HistoryRow = RunListingResponse["rows"][number];

/** A run is named by the time it started, with dashes where the clock has colons. */
function startedAt(run: string): string {
	const started = new Date(
		run.replace(
			/T(?<hours>\d\d)-(?<minutes>\d\d)-(?<seconds>\d\d)/u,
			"T$<hours>:$<minutes>:$<seconds>",
		),
	);

	return Number.isNaN(started.getTime())
		? NOT_RECORDED
		: momentReading(started.getTime());
}

function stepNumber(record: RunRecordResponse, stage: string): number {
	return (
		record.stages.findIndex((each) => each.stage === stage) + STAGE_NUMBER_BASE
	);
}

function belowMinimum(record: RunRecordResponse, stage: string): string {
	const stopped = record.stages.find((each) => each.stage === stage);
	const minimum =
		stopped === undefined ? undefined : missedMinimum(record, stopped);

	return minimum === undefined ? "" : ` · below minimum ${minimum}`;
}

function endingWords(row: PipelineRow, record: RunRecordResponse): string {
	if (isStopped(row.status)) {
		const stage = stoppedStageOf(row.status);

		return `stopped at step ${String(stepNumber(record, stage))}${belowMinimum(record, stage)}`;
	}

	if (row.status === OPERATOR_STOPPED) {
		return "stopped by the operator";
	}

	if (isPaused(row.status)) {
		return "paused";
	}

	if (row.progress.state === "running") {
		return `running step ${String(stepNumber(record, row.progress.stage))}`;
	}

	return row.status.toLowerCase().replaceAll("_", " ");
}

/**
 * The ended step selected by default: where the run stopped, or else the last
 * one that left a record.
 */
function defaultEndedStage(
	row: PipelineRow,
	record: RunRecordResponse,
): MonitoredStage | undefined {
	if (isStopped(row.status)) {
		const stage = stoppedStageOf(row.status);

		return record.stages.find((each) => each.stage === stage);
	}

	return record.stages.findLast((each) => each.status !== "no-record");
}

function metaLine(row: PipelineRow): string {
	return [
		`Started ${startedAt(row.run)}`,
		`Time ${row.wallTime.state === "available" ? minutesAndSeconds(row.wallTime.ms) : NOT_RECORDED}`,
		`Cost ${row.cost.state === "available" ? spendReading(row.cost.usd) : NOT_RECORDED}`,
	].join(" · ");
}

function executionReading(row: PipelineRow, record: RunRecordResponse): string {
	if (row.progress.state === "running") {
		return endingWords(row, record);
	}

	if (row.status === "AWAITING_HUMAN_REVIEW") {
		return "Execution ended";
	}

	return `Execution ended · ${endingWords(row, record)}`;
}

function humanReviewReading(
	row: PipelineRow,
	record: RunRecordResponse,
): string {
	if (record.humanReview?.state === "available") {
		return record.humanReview.review.verdict;
	}

	return row.status === "AWAITING_HUMAN_REVIEW" ? "pending" : "not recorded";
}

/**
 * The selected step: the one the URL names, then the running step, then the
 * one the run stopped at, or else the last one that left a record, or else
 * the first.
 */
function selectedStage(
	row: PipelineRow,
	record: RunRecordResponse,
	step: string | undefined,
): MonitoredStage | undefined {
	const running =
		row.progress.state === "running" ? row.progress.stage : undefined;
	return (
		record.stages.find((each) => each.stage === step) ??
		record.stages.find((each) => each.stage === running) ??
		defaultEndedStage(row, record) ??
		record.stages[INITIAL_RECORDED_STAGE_INDEX]
	);
}

export {
	NO_SELECTED_STAGE_NUMBER,
	STAGE_NUMBER_BASE,
	defaultEndedStage,
	executionReading,
	humanReviewReading,
	metaLine,
	selectedStage,
};
export type { HistoryRow, PipelineRow };
