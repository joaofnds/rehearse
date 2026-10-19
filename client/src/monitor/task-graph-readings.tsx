import {
	corpusMeasurementReading,
	corpusVersionHash,
} from "#benchmark/corpus-version-label";
import { liveElapsedMs, spendReading } from "#client/run-history/run-progress";
import { hasRunEnded } from "#client/run-history/run-status";
import type { PipelineRow } from "#client/shell/run-in-flight";

import minutesAndSeconds from "./minutes-and-seconds";
import type { MonitoredStage } from "./run-record-query";
import type { RunningProgress } from "./task-graph-status";
import { isRunning, liveProgress, notStarted } from "./task-graph-status";

const SINGLE_ITEM_COUNT = 1;

const NO_SPEND_USD = 0;

const EMPTY_COLLECTION_LENGTH = 0;

const NOT_RECORDED = "—";

/** Whether a running stage's spend figure, by its scope, is the stage's own. */
const SCOPE_IS_OWN_SPEND = {
	"the stages finished before this one": false,
	"this stage's session": true,
	"this stage's session and its judge": true,
	"this stage's session so far": true,
} as const satisfies Record<RunningProgress["spendScope"], boolean>;

/**
 * What the stage has cost: the running stage's own spend, as the run measured
 * it at its latest event, or else its session and judge cost as its record
 * keeps them. A stage not started has spent nothing.
 */
function costReading(stage: MonitoredStage, row: PipelineRow): string {
	const progress = liveProgress(stage, row);
	if (progress !== undefined) {
		return spendReading(
			SCOPE_IS_OWN_SPEND[progress.spendScope]
				? progress.spentUsd
				: NO_SPEND_USD,
		);
	}
	if (notStarted(stage, row)) {
		return hasRunEnded(row) ? NOT_RECORDED : spendReading(NO_SPEND_USD);
	}

	const parts = [stage.sessionCost, stage.judgeCost].flatMap((part) =>
		part.state === "available" ? [part.usd] : [],
	);

	return parts.length === EMPTY_COLLECTION_LENGTH
		? NOT_RECORDED
		: spendReading(parts.reduce((total, usd) => total + usd, NO_SPEND_USD));
}

/**
 * How long the stage has run: the running stage's time since it started,
 * advancing between the run's measurements (SPEC.md:354), or else the wall
 * time its record keeps.
 */
function durationReading(
	stage: MonitoredStage,
	row: PipelineRow,
	nowMs: number,
): string {
	const progress = liveProgress(stage, row);
	if (progress?.stageElapsedMs !== undefined) {
		return minutesAndSeconds(
			liveElapsedMs(progress.stageElapsedMs, progress.measuredAt, nowMs),
		);
	}

	return stage.wallTime.state === "available"
		? minutesAndSeconds(stage.wallTime.ms)
		: NOT_RECORDED;
}

function blockersReading(blockers: MonitoredStage["blockers"]): string {
	return blockers.state === "available"
		? `${String(blockers.fired)} of ${String(blockers.total)} fired`
		: NOT_RECORDED;
}

/**
 * The corpus the stage ran against. The running stage has written no record
 * yet, so it reads the version the run is under, as the header does.
 */
function corpusReading(stage: MonitoredStage, row: PipelineRow): string {
	const corpusVersion =
		stage.corpusVersion ??
		(isRunning(stage, row) ? row.corpusVersion : undefined);

	return corpusVersion?.kind === "version"
		? corpusVersionHash(corpusVersion.digest)
		: corpusMeasurementReading(corpusVersion);
}

function counted(count: number, noun: string): string {
	return `${String(count)} ${noun}${count === SINGLE_ITEM_COUNT ? "" : "s"}`;
}

function countReading(count: number, noun: string, direction: string): string {
	return `${counted(count, noun)} ${direction}`;
}

/**
 * What a stage's record says it produced, which stands in for its contribution
 * until an analysis of the run gives one. A reading the record lacks, or one
 * that counts nothing, adds no part.
 */
function producedReading(stage: MonitoredStage): string | undefined {
	const { commitSubjects, changedPaths, workflowState } = stage.artifactsOut;
	const parts = [
		commitSubjects.state === "available" &&
			commitSubjects.subjects.length > EMPTY_COLLECTION_LENGTH &&
			counted(commitSubjects.subjects.length, "commit"),
		changedPaths.state === "available" &&
			changedPaths.paths.length > EMPTY_COLLECTION_LENGTH &&
			countReading(changedPaths.paths.length, "file", "changed"),
		workflowState.state === "available" &&
			workflowState.changes.length > EMPTY_COLLECTION_LENGTH &&
			counted(workflowState.changes.length, "workflow-state change"),
	].filter((part) => part !== false);

	return parts.length === EMPTY_COLLECTION_LENGTH
		? undefined
		: `produced ${parts.join(", ")}`;
}

function outputReading(
	stage: MonitoredStage,
	row: PipelineRow,
	contribution: string | undefined,
): string | undefined {
	if (notStarted(stage, row)) {
		return hasRunEnded(row) ? "No output recorded" : "not started";
	}
	return contribution ?? producedReading(stage);
}

export {
	blockersReading,
	corpusReading,
	costReading,
	durationReading,
	outputReading,
};
