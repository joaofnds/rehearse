import {
	corpusMeasurementReading,
	corpusVersionLabel,
} from "#benchmark/corpus-version-label";
import type { StoppedStatus } from "#benchmark/stopped-status";
import { isStopped, stoppedStageOf } from "#benchmark/stopped-status";
import type {
	MonitoredStage,
	RunRecordResponse,
} from "#client/monitor/run-record-query";
import { missedMinimum } from "#client/monitor/run-record-query";
import { nodeStatus } from "#client/monitor/task-graph";
import type { PipelineRow } from "#client/shell/run-in-flight";

import { StatusWords } from "./record-ledger-card-header";
import type { Unreached } from "./record-ledger-model";
import { stepName } from "./record-ledger-model";

const ORDINAL_BASE = 1;

/** The corpus a stopped run's outcome is recorded for, as every surface names it. */
function runCorpus(row: PipelineRow): string {
	const { corpusVersion } = row;

	return corpusVersion?.kind === "version"
		? corpusVersionLabel(corpusVersion.digest)
		: `this run's corpus, ${corpusMeasurementReading(corpusVersion)}`;
}

/**
 * A stop record also ends a run the spend ceiling, a signal or a failed judge
 * stopped, so only a letter below the minimum or a judge's STOP is an
 * outcome the run records for its corpus.
 */
function judgedStop(stage: MonitoredStage | undefined): boolean {
	const grade = stage?.grade;

	return (
		grade?.state === "available" &&
		(!grade.reachesMinimum || grade.verdict === "STOP")
	);
}

interface UnreachedRunEvidence {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
}

interface NeverRanWordsContext {
	readonly stage: MonitoredStage;
	readonly number: number;
}

function neverRanWords(
	unreached: Unreached,
	stopped: NeverRanWordsContext,
	{ row, record }: UnreachedRunEvidence,
): string {
	const below =
		missedMinimum(record, stopped.stage) === undefined
			? ""
			: " fell below the minimum";

	return `${stepName(unreached)} never ran. The run stopped after step ${String(stopped.number)}${below}. This is a recorded outcome for ${runCorpus(row)}, not a failed execution.`;
}

/** The stage a stopped run stopped at, with its step number. */
function stoppedStep(
	status: StoppedStatus,
	record: RunRecordResponse,
): { readonly stage: MonitoredStage; readonly number: number } | undefined {
	const stoppedAt = stoppedStageOf(status);
	const index = record.stages.findIndex(({ stage }) => stage === stoppedAt);
	const stage = record.stages[index];

	return stage === undefined
		? undefined
		: { number: index + ORDINAL_BASE, stage };
}

/**
 * How an ended run's ending reads for a stage it left without a record: the
 * stage it ended in started and left none, and every later one did not run.
 */
function endingWords(
	unreached: Unreached,
	record: RunRecordResponse,
): string | undefined {
	const { finalOutcome } = record;
	if (finalOutcome.status === "JUDGING_FAILED") {
		return `${stepName(unreached)} did not run: ${finalOutcome.reason}.`;
	}

	if (finalOutcome.status !== "NOT_REACHED") {
		return undefined;
	}

	return finalOutcome.stage === unreached.stage.stage
		? `${stepName(unreached)} ended without a record: ${finalOutcome.reason}.`
		: `${stepName(unreached)} did not run: ${finalOutcome.reason}.`;
}

interface UnreachedStageProps {
	readonly unreached: Unreached;
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
}

function UnreachedStage({
	unreached,
	row,
	record,
}: UnreachedStageProps): React.JSX.Element {
	const ended = record.finalOutcome.status !== "PENDING";
	const ending = endingWords(unreached, record);
	const stopped = isStopped(row.status)
		? stoppedStep(row.status, record)
		: undefined;

	if (ended && stopped !== undefined && judgedStop(stopped.stage)) {
		return (
			<li className="min-w-0 rounded-card border border-dashed border-strong px-3.5 py-3 text-12 text-pretty text-muted-foreground wrap-anywhere">
				{neverRanWords(unreached, stopped, { record, row })}
			</li>
		);
	}

	if (ending !== undefined) {
		return (
			<li className="min-w-0 px-3.5 py-1 text-12 text-muted-foreground wrap-anywhere">
				{ending}
			</li>
		);
	}

	return (
		<li className="flex min-w-0 flex-wrap items-center gap-3 px-3.5 py-1 text-12 wrap-anywhere">
			{stepName(unreached)}
			<StatusWords status={nodeStatus(unreached.stage, row, record)} />
		</li>
	);
}

export { UnreachedStage as default };
