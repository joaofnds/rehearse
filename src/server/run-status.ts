import { unhandled } from "#benchmark/contracts";
import { recordFileExists, recordFileText } from "#benchmark/record-read-scope";
import runEnding from "#benchmark/run-ending";
import type { RunEnding } from "#benchmark/run-ending";
import type { RunEventStore } from "#benchmark/run-events";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import type { BenchmarkRunPaths, RunLocation } from "#benchmark/run-layout";
import type { RunLiveness } from "#benchmark/run-liveness";
import {
	OPERATOR_STOPPED,
	pausedStatus,
	stoppedStatus,
} from "#benchmark/stopped-status";
import IncompleteRunRecordError from "#server/run-status-contract";
import type { ContextLink, RunIdentity } from "#server/run-status-contract";
import runningIdentity from "#server/run-status-process-ending";
import {
	artifactIdentity,
	eventBackedIdentity,
	manifestBackedIdentity,
} from "#server/run-status-record-identity";

/**
 * A signal abort, or a failure before the stage wrote its record, leaves
 * `run-failed` and nothing on disk for the stage it failed in, so the row
 * says so instead of linking to a page with no record.
 */
function failedLinks(stage: string | undefined): readonly ContextLink[] {
	if (stage === undefined) {
		return [];
	}

	return [
		{
			label: stage,
			reason: "failed before saving its context",
			state: "unavailable",
		},
	];
}

async function statusAndCaseId(
	{ runsDirectory, run }: RunLocation,
	runEvents: RunEventStore,
	liveness: RunLiveness,
): Promise<RunIdentity | undefined> {
	return await endingIdentity(
		{ run, runsDirectory },
		await runEnding({ run, runsDirectory }, runEvents, liveness),
		runEvents,
	);
}

/**
 * The status and case a run's history row shows for an ending already read,
 * undefined for a run the history lists no row for.
 */
async function endingIdentity(
	{ runsDirectory, run }: RunLocation,
	ending: RunEnding,
	runEvents: RunEventStore,
): Promise<RunIdentity | undefined> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	switch (ending.kind) {
		case "main-artifact": {
			return artifactIdentity(await recordFileText(paths.artifactFile));
		}
		case "stopped":
		case "paused": {
			return await manifestBackedIdentity(
				paths,
				ending.kind === "stopped"
					? stoppedStatus(ending.stage)
					: pausedStatus(ending.stage),
			);
		}
		case "operator-stopped": {
			return await manifestBackedIdentity(paths, OPERATOR_STOPPED);
		}
		case "interrupted":
		case "awaiting-judgment":
		case "failed": {
			return await eventBackedIdentity(
				paths,
				ending.kind === "failed" ? "FAILED" : "INTERRUPTED",
				ending.kind === "failed" ? failedLinks(ending.stage) : [],
			);
		}
		case "running": {
			return await runningIdentity({ paths, run }, ending.latest, runEvents);
		}
		case "unconfirmed": {
			return undefined;
		}
		case "completed-without-artifact":
		case "no-events": {
			throw ending.kind === "completed-without-artifact"
				? new IncompleteRunRecordError(
						"incomplete: the run recorded run-completed but no artifact",
					)
				: await missingRunEventsError(paths);
		}
		default: {
			return unhandled(ending, "run ending");
		}
	}
}

async function missingRunEventsError(
	paths: BenchmarkRunPaths,
): Promise<IncompleteRunRecordError> {
	return new IncompleteRunRecordError(
		(await recordFileExists(paths.manifestFile))
			? "no record: no stage record and no run events"
			: "no manifest recorded",
	);
}

/**
 * The status a run's history row shows, undefined for a run the history lists
 * no row for.
 */
async function runStatus(
	{ runsDirectory, run }: RunLocation,
	runEvents: RunEventStore,
	liveness: RunLiveness,
): Promise<string | undefined> {
	const identity = await statusAndCaseId(
		{ run, runsDirectory },
		runEvents,
		liveness,
	);

	return identity?.status;
}

export { statusAndCaseId, endingIdentity, runStatus };
export { default as IncompleteRunRecordError } from "#server/run-status-contract";
export { default as checkpointlessStageRecorded } from "#server/run-status-checkpointless-stage-recorded";
export type { RunProgress, ContextLink } from "#server/run-status-contract";
export {
	sourceCaseId,
	latestCheckpointStage,
} from "#server/run-status-record-identity";
