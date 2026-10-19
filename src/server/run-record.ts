import type { CorpusRoot } from "#benchmark/corpus-file";
import { openRunEventStore } from "#benchmark/run-events";
import type { RunEventStore } from "#benchmark/run-events";
import { runEventsDatabaseFile } from "#benchmark/run-layout";
import type { RunLocation } from "#benchmark/run-layout";
import type { RunLiveness } from "#benchmark/run-liveness";
import assembleRunRecord from "#server/run-record-assembly";
import type { RunRecord } from "#server/run-record-contract";
import {
	finalOutcome,
	readEnding,
	statusReading,
} from "#server/run-record-ending";
import judgeRunRecord from "#server/run-record-review";
import readRunSource from "#server/run-record-source";

/**
 * One pipeline run projected across the files it wrote: its manifest for the
 * stage order, each stage's own record, its checkpoints, and its main
 * artifact when it finished. `/api/records/:id` serves one of those files
 * whole; this reads all of them into the figures a run's page shows.
 */
async function readRunRecord(
	{ runsDirectory, run }: RunLocation,
	liveness: RunLiveness,
	eventStore?: RunEventStore,
): Promise<RunRecord> {
	const source = await readRunSource({ run, runsDirectory });
	const runEvents =
		eventStore ??
		(await openRunEventStore(runEventsDatabaseFile(runsDirectory)));
	try {
		const ending = await readEnding(
			{ run, runsDirectory },
			runEvents,
			liveness,
		);
		const outcome = await finalOutcome(runsDirectory, run, ending);

		return assembleRunRecord(source, {
			outcome,
			status: await statusReading({ run, runsDirectory }, runEvents, ending),
		});
	} finally {
		if (eventStore === undefined) {
			runEvents.close();
		}
	}
}

/**
 * The run's record with each checkpoint's read manifest judged against the
 * corpus under test, as the run's page shows it. The run history reads the
 * unjudged record, since it judges each row once for itself. A corpus under
 * test that cannot judge the run leaves its entries without a state, since
 * the record stands on its own and the run history names why the run is
 * unreadable.
 */
async function readJudgedRunRecord(
	{ runsDirectory, run }: RunLocation,
	liveness: RunLiveness,
	source: CorpusRoot,
): Promise<RunRecord> {
	const record = await readRunRecord({ run, runsDirectory }, liveness);
	return await judgeRunRecord(record, { run, runsDirectory }, source);
}

export { readRunRecord, readJudgedRunRecord };
export {
	INTERRUPTED_REASON,
	RUN_FAILED_REASON,
	PAUSED_REASON,
	OPERATOR_STOPPED_REASON,
	AWAITING_JUDGMENT_REASON,
	AWAITING_GRADE_REASON,
	UNEXPLAINED_END_REASON,
	UNREADABLE_ENDING_REASON,
	PRODUCT_OWNER_COST_REASON,
	STOPPED_GRADE_REASON,
	WALL_TIME_REASON,
	RUN_WALL_TIME_REASON,
	UNRECORDED_STAGE_REASON,
	UNREACHED_STAGE_REASON,
	MISSING_STAGE_RECORD_REASON,
	CALL_WITHOUT_METRICS_REASON,
	UNGRADED_BLOCKERS_REASON,
	MINIMUM_GRADE_REASON,
	PRODUCT_OWNER_TOKENS_REASON,
} from "#server/run-record-reasons";
export {
	wallTime,
	currentStageIndex,
	stagePlace,
} from "#server/run-record-reading";
export { readStageFile } from "#server/run-stage-file";
export {
	stageStatus,
	firedBlockerIds,
	recordedHardBlockers,
} from "#server/run-stage-assembly";
export { artifactsIn } from "#server/run-workflow-artifacts";
export { costReading } from "#server/run-record-totals";
export type {
	Reading,
	MissingPart,
	TokenCounts,
	TokenReading,
	StageStatus,
	RunRecordStage,
	ShortIdReading,
	PathsReading,
	WorkflowStateChange,
	ArtifactsOut,
	ArtifactIn,
	ArtifactsIn,
	FinalOutcome,
	CostPart,
	CostReading,
	WallTimeReading,
	RunTotals,
	RunIdentity,
	RunRecord,
	StagePlace,
} from "#server/run-record-contract";

export type { EarlierStage } from "#server/run-workflow-artifacts";
