import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { corpusMeasurementReading } from "#benchmark/corpus-version-label";
import {
	isPaused,
	isStopped,
	OPERATOR_STOPPED,
	stoppedStageOf,
} from "#benchmark/stopped-status";
import { LaunchDialog } from "#client/launch/launch-dialog";
import { minutesAndSeconds } from "#client/monitor/task-graph";
import { shortCommit } from "#client/monitor/run-identity-header";
import type {
	MonitoredStage,
	RunRecordResponse,
} from "#client/monitor/run-record-query";
import { runRecordQuery } from "#client/monitor/run-record-query";
import { polledRunHistoryQuery } from "#client/run-history/run-history-polling";
import { spendReading } from "#client/run-history/run-progress";
import { runStatusState } from "#client/run-history/run-status";
import type { PipelineRow } from "#client/shell/run-in-flight";
import { CorpusPill } from "#client/system/components/corpus-pill";
import { EmptyState } from "#client/system/components/empty-state";
import { STATUS_VOCABULARY } from "#client/system/components/status";
import { Switcher } from "#client/system/components/switcher";
import { Button } from "#client/system/ui/button";
import { TaskGradeCard } from "./task-grade-card";

const LAYOUTS = ["Contribution"] as const;

const LAYOUT_NOTE = "Layout C · task grade first, then the culprit pass";

const NOT_RECORDED = "—";

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
		: started.toLocaleString(undefined, {
				day: "2-digit",
				month: "short",
				hour: "2-digit",
				minute: "2-digit",
			});
}

function stepNumber(record: RunRecordResponse, stage: string): number {
	return record.stages.findIndex((each) => each.stage === stage) + 1;
}

function belowMinimum(record: RunRecordResponse, stage: string): string {
	const stopped = record.stages.find((each) => each.stage === stage);
	if (
		record.minimumGrade.state === "unavailable" ||
		stopped?.grade.state !== "available" ||
		stopped.grade.reachesMinimum
	) {
		return "";
	}

	return ` · below minimum ${record.minimumGrade.letter}`;
}

/** How the run ended, or where it is, in the header's words. */
function endingWords(row: PipelineRow, record: RunRecordResponse): string {
	const { status, progress } = row;
	if (isStopped(status)) {
		const stage = stoppedStageOf(status);

		return `stopped at step ${String(stepNumber(record, stage))}${belowMinimum(record, stage)}`;
	}
	if (status === OPERATOR_STOPPED) {
		return "stopped by the operator";
	}
	if (isPaused(status)) {
		return "paused";
	}
	if (progress.state === "running") {
		return `running step ${String(stepNumber(record, progress.stage))}`;
	}

	return status.toLowerCase().replaceAll("_", " ");
}

/**
 * The stage the header replays: the one the run stopped at, or else the last
 * one that left a record.
 */
function replayedStage(
	row: PipelineRow,
	record: RunRecordResponse,
): MonitoredStage | undefined {
	if (isStopped(row.status)) {
		const stage = stoppedStageOf(row.status);

		return record.stages.find((each) => each.stage === stage);
	}

	return record.stages.findLast((each) => each.status !== "no-record");
}

/**
 * A replay starts from the checkpoint the stage before it saved, so a stage
 * whose predecessor saved none has nothing to replay from. The first stage
 * starts from the run's initial checkpoint, which the launch checks.
 */
export function consumedCheckpointMissing(
	record: RunRecordResponse,
	stage: string,
): boolean {
	const index = record.stages.findIndex((each) => each.stage === stage);

	return index > 0 && record.stages[index - 1]?.checkpoint === "missing";
}

export function ReplayButton({
	run,
	record,
	stage,
	label,
}: {
	readonly run: string;
	readonly record: RunRecordResponse;
	readonly stage: string;
	readonly label: string;
}): React.JSX.Element {
	if (consumedCheckpointMissing(record, stage)) {
		return (
			<Button
				variant="default"
				size="compact"
				aria-disabled="true"
				aria-label={`${label}: ${stage} has no checkpoint to replay from`}
			>
				{label}
			</Button>
		);
	}

	return (
		<LaunchDialog
			target={{ kind: "replay", run, stage }}
			trigger={
				<Button variant="default" size="compact">
					{label}
				</Button>
			}
		/>
	);
}

function metaLine(row: PipelineRow, record: RunRecordResponse): string {
	const { identity } = record;

	return [
		startedAt(row.run),
		row.wallTime.state === "available"
			? minutesAndSeconds(row.wallTime.ms)
			: NOT_RECORDED,
		row.cost.state === "available" ? spendReading(row.cost.usd) : NOT_RECORDED,
		identity.effort === undefined
			? identity.model
			: `${identity.model} / ${identity.effort}`,
	].join(" · ");
}

function RunDetailHeader({
	row,
	record,
}: {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
}): React.JSX.Element {
	const replayed = replayedStage(row, record);
	const { corpusVersion } = row;

	return (
		<header className="flex flex-none flex-wrap items-center gap-3.5 border-b border-divider px-6 py-3.75">
			<Button asChild variant="quiet" size="compact">
				<Link to="/">
					<span aria-hidden="true">←</span> History
				</Link>
			</Button>
			<div>
				<h1 className="flex items-center gap-2.75 text-16">
					<span className="font-mono">{row.shortId ?? row.run}</span>
					<span className="text-12-5 text-muted-foreground">
						{record.caseId}
					</span>
				</h1>
				<p className="mt-1 flex items-center gap-2.5 text-11-5 text-dim">
					<span aria-hidden="true">
						{STATUS_VOCABULARY[runStatusState(row.status)].glyph}
					</span>
					<span>{endingWords(row, record)}</span>
					<span>·</span>
					<span className="font-mono">{metaLine(row, record)}</span>
				</p>
			</div>
			<div className="ml-auto flex flex-wrap items-center gap-2.5">
				{corpusVersion?.kind === "version" ? (
					<CorpusPill hash={corpusVersion.digest} />
				) : (
					<span className="text-11-5 text-muted-foreground">
						{corpusMeasurementReading(corpusVersion)}
					</span>
				)}
				<Switcher
					label="Run detail layout"
					options={LAYOUTS}
					selected="Contribution"
					onSelect={() => undefined}
				/>
				{replayed === undefined ? null : (
					<ReplayButton
						run={row.run}
						record={record}
						stage={replayed.stage}
						label={`Replay step ${String(stepNumber(record, replayed.stage))}`}
					/>
				)}
			</div>
		</header>
	);
}

function stepsWords(numbers: readonly number[]): string {
	const [first] = numbers;
	const last = numbers.at(-1);
	if (first === undefined || last === undefined) {
		return "";
	}
	if (numbers.length === 1) {
		return `step ${String(first)}`;
	}

	return last - first === numbers.length - 1
		? `steps ${String(first)}–${String(last)}`
		: `steps ${numbers.join(", ")}`;
}

/** What stopping did to the target, and what the run kept to replay from. */
function restoreWords(record: RunRecordResponse): string {
	const retained = record.stages.flatMap((stage, index) =>
		stage.checkpoint === "recorded" ? [index + 1] : [],
	);
	const restored = `Repository restored to ${record.identity.target} @ ${shortCommit(record.identity.commit)}.`;

	return retained.length === 0
		? `${restored} No step saved a checkpoint to replay from.`
		: `${restored} Checkpoints from ${stepsWords(retained)} are retained and replayable.`;
}

function RestoreBanner({
	row,
	record,
}: {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
}): React.JSX.Element {
	const stopped = isStopped(row.status) || row.status === OPERATOR_STOPPED;

	return (
		<div className="flex flex-none items-center gap-2.25 border-b border-divider bg-secondary px-6 py-2 text-11-5 text-secondary-foreground">
			{stopped ? (
				<p>
					<span aria-hidden="true">↺ </span>
					{restoreWords(record)}
				</p>
			) : null}
			<span className="ml-auto text-dim">{LAYOUT_NOTE}</span>
		</div>
	);
}

/**
 * Run detail (SPEC.md 4): one recorded pipeline run, read in the layout the
 * operator picks. Only Contribution exists until ACT-250 adds Step rail and
 * Record ledger.
 */
export function RunDetailPage({
	run,
}: {
	readonly run: string;
}): React.JSX.Element | null {
	const history = useQuery(polledRunHistoryQuery);
	const record = useQuery(runRecordQuery(run));
	if (history.isError || record.isError) {
		return (
			<p role="alert" className="px-6 py-4 text-muted-foreground">
				<span aria-hidden="true">⚠ </span>
				Could not read run {run}.
			</p>
		);
	}
	if (history.data === undefined || record.data === undefined) {
		return null;
	}

	const rows = history.data.rows.filter(
		(each): each is PipelineRow => each.kind === "run",
	);
	const row = rows.find((each) => each.run === run);
	if (row === undefined) {
		return (
			<EmptyState heading="No recorded run has this id">
				<p>Run history lists every recorded run.</p>
			</EmptyState>
		);
	}

	return (
		<div className="flex h-full flex-col">
			<RunDetailHeader row={row} record={record.data} />
			<RestoreBanner row={row} record={record.data} />
			<div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
				<div className="mx-auto flex max-w-250 flex-col gap-4.5">
					<TaskGradeCard
						row={row}
						rows={rows}
						outcome={record.data.finalOutcome}
					/>
				</div>
			</div>
		</div>
	);
}
