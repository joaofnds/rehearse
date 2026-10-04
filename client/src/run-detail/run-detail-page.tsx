import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { corpusMeasurementReading } from "#benchmark/corpus-version-label";
import {
	isPaused,
	isStopped,
	OPERATOR_STOPPED,
	stoppedStageOf,
} from "#benchmark/stopped-status";
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
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import type { PipelineRow } from "#client/shell/run-in-flight";
import { CorpusPill } from "#client/system/components/corpus-pill";
import { EmptyState } from "#client/system/components/empty-state";
import { STATUS_VOCABULARY } from "#client/system/components/status";
import { Switcher } from "#client/system/components/switcher";
import { Button } from "#client/system/ui/button";
import { analysesQuery, rolesOf } from "./analysis-query";
import { analysisWait } from "./analysis-request";
import { CulpritAnalysisSection } from "./culprit-analysis-section";
import { ReplayButton } from "./replay-button";
import { StepMap } from "./step-map";
import { TaskGradeCard } from "./task-grade-card";

const LAYOUTS = ["Contribution"] as const;

const LAYOUT_NOTE = "Layout C · task grade first, then the culprit pass";

const NOT_RECORDED = "—";

type HistoryRow = RunHistoryResponse["rows"][number];

/** Calls back when the reading differs from the one before it. */
function useWhenChanged(reading: string, onChanged: () => void): void {
	const previous = useRef(reading);
	useEffect(() => {
		if (previous.current !== reading) {
			onChanged();
		}
		previous.current = reading;
	}, [reading, onChanged]);
}

/**
 * Where the polled run history says the run is. A live run's record changes
 * as it moves from one step to the next and as it ends.
 */
function phaseOf(rows: readonly HistoryRow[], run: string): string {
	const row = rows.find(
		(each): each is PipelineRow => each.kind === "run" && each.run === run,
	);
	if (row === undefined) {
		return "unlisted";
	}

	return row.progress.state === "running"
		? `${row.status} at ${row.progress.stage}`
		: row.status;
}

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

/** Whether the run has ended, as the server judges it before an analysis. */
function hasRunEnded({ status, progress }: PipelineRow): boolean {
	return progress.state !== "running" && !isPaused(status);
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
	const analysisInFlight = (history.data?.launches ?? []).some(
		(launch) =>
			launch.target === "analysis" &&
			launch.run === run &&
			launch.status === "RUNNING",
	);
	const analyses = useQuery(analysesQuery(run));
	const queryClient = useQueryClient();
	// An analysis writes its record as its process ends, which the polled run
	// history shows as its launch leaving the list.
	useWhenChanged(String(analysisInFlight), () => {
		void queryClient.invalidateQueries({
			queryKey: analysesQuery(run).queryKey,
		});
	});
	useWhenChanged(phaseOf(history.data?.rows ?? [], run), () => {
		void queryClient.invalidateQueries({
			queryKey: runRecordQuery(run).queryKey,
		});
	});
	const unreadable = (
		<p role="alert" className="px-6 py-4 text-muted-foreground">
			<span aria-hidden="true">⚠ </span>
			Could not read run {run}.
		</p>
	);
	if (history.isError) {
		return unreadable;
	}
	if (history.data === undefined) {
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
	if (record.isError) {
		return unreadable;
	}
	if (record.data === undefined) {
		return null;
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
					<StepMap record={record.data} roles={rolesOf(analyses.data)} />
					<CulpritAnalysisSection
						run={run}
						record={record.data}
						reading={analyses.isError ? "unreadable" : analyses.data}
						wait={analysisWait({
							runEnded: hasRunEnded(row),
							analysisInFlight,
						})}
					/>
				</div>
			</div>
		</div>
	);
}
