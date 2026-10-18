import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { corpusMeasurementReading } from "#benchmark/corpus-version-label";
import {
	isPaused,
	isStopped,
	OPERATOR_STOPPED,
	stoppedStageOf,
} from "#benchmark/stopped-status";
import { withinCase } from "#client/within-case";
import { minutesAndSeconds } from "#client/monitor/minutes-and-seconds";
import type {
	MonitoredStage,
	RunRecordResponse,
} from "#client/monitor/run-record-query";
import {
	missedMinimum,
	runRecordQuery,
	stageReplayRefusal,
} from "#client/monitor/run-record-query";
import {
	polledRunHistoryQuery,
	polledRunListingQuery,
} from "#client/run-history/run-history-polling";
import { spendReading } from "#client/run-history/run-progress";
import { hasRunEnded, runStatusState } from "#client/run-history/run-status";
import type {
	RunListingResponse,
	PipelineRowWithStaleness,
} from "#client/run-history/run-history-query";
import { CorpusPill } from "#client/system/components/corpus-pill";
import { EmptyState } from "#client/system/components/empty-state";
import { STATUS_VOCABULARY } from "#client/system/components/status";
import { Switcher } from "#client/system/components/switcher";
import {
	HeaderControls,
	shortCommit,
} from "#client/monitor/run-identity-header";
import { SpendBand } from "#client/monitor/spend-band";
import { TaskGraph } from "#client/monitor/task-graph";
import { StagePanes } from "#client/monitor/stage-panes";
import { useRunEventsStream } from "#client/monitor/run-events-stream";
import { StepModalAction } from "#client/monitor/step-modal";
import { SessionHistoryPage } from "#client/session-history/session-history-page";
import { StepReport, wallTimeReading } from "./step-report";
import { stageCostReading } from "./step-readings";
import { CheckpointAttempts } from "./checkpoint-attempts";
import { RunSetup } from "./run-setup";
import { Button } from "#client/system/ui/button";
import type { AnalysisReadingResponse } from "./analysis-query";
import { analysesQuery, rolesOf } from "./analysis-query";
import { analysisWait } from "./analysis-request";
import { RootCauseAnalysisSection } from "./root-cause-analysis-section";
import { momentReading } from "./moment-reading";
import { RecordLedger } from "./record-ledger";
import { ReplayButton } from "./replay-button";
import type { RunDetailSearch, RunWorkspaceView } from "./run-detail-search";
import { RUN_WORKSPACE_VIEWS, VIEW_LABELS } from "./run-detail-search";
import { StepMap } from "./step-map";
import { STAGE_ATTEMPTS_KEY } from "./stage-attempts-query";
import { TaskGradeCard } from "./task-grade-card";
import { useRunsReturnSearch } from "#client/run-history/run-discovery";
import {
	finalAssessmentQuery,
	STAGE_OUTPUT_KEY,
	FINAL_ASSESSMENT_KEY,
} from "./investigation-query";

type PipelineRow = Extract<HistoryRow, { readonly kind: "run" }>;

const NOT_RECORDED = "—";

type HistoryRow = RunListingResponse["rows"][number];

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
		: momentReading(started.getTime());
}

function stepNumber(record: RunRecordResponse, stage: string): number {
	return record.stages.findIndex((each) => each.stage === stage) + 1;
}

function belowMinimum(record: RunRecordResponse, stage: string): string {
	const stopped = record.stages.find((each) => each.stage === stage);
	const minimum =
		stopped === undefined ? undefined : missedMinimum(record, stopped);

	return minimum === undefined ? "" : ` · below minimum ${minimum}`;
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

function metaLine(row: PipelineRow, record: RunRecordResponse): string {
	const { identity } = record;

	return [
		startedAt(row.run),
		row.wallTime.state === "available"
			? minutesAndSeconds(row.wallTime.ms)
			: NOT_RECORDED,
		row.cost.state === "available" ? spendReading(row.cost.usd) : NOT_RECORDED,
		`${identity.target} @ ${shortCommit(identity.commit)}`,
		identity.effort === undefined
			? identity.model
			: `${identity.model} / ${identity.effort}`,
	].join(" · ");
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

function RunDetailHeader({
	row,
	record,
}: {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
}): React.JSX.Element {
	const { corpusVersion } = row;
	const humanState = humanReviewReading(row, record);
	const returnSearch = useRunsReturnSearch();

	return (
		<header className="flex flex-none flex-wrap items-center gap-4 border-b border-divider page-gutter py-6">
			<Button asChild variant="quiet" size="compact">
				<Link to="/" search={returnSearch}>
					<span aria-hidden="true">←</span> Runs
				</Link>
			</Button>
			<div>
				<h1 className="flex min-w-0 flex-wrap items-center gap-2.75 text-24 leading-heading">
					<span className="font-mono">
						{withinCase(row.shortId ?? row.run, row.caseId)}
					</span>
					<Link
						to="/cases"
						search={{ caseId: record.caseId }}
						className="text-14 text-link hover:text-link-hover"
					>
						{record.caseId}
					</Link>
				</h1>
				<p className="mt-1 flex flex-wrap items-center gap-2.5 text-12 text-dim">
					<span aria-hidden="true">
						{STATUS_VOCABULARY[runStatusState(row.status)].glyph}
					</span>
					<span>{endingWords(row, record)}</span>
					<span>·</span>
					<span className="font-mono">{metaLine(row, record)}</span>
				</p>
				{row.progress.state === "running" ? null : (
					<p className="mt-1 text-12 text-muted-foreground">
						Execution ended · Final result:{" "}
						{record.finalOutcome.status === "JUDGED"
							? record.finalOutcome.verdict
							: "unavailable"}{" "}
						· Human review: {humanState}
					</p>
				)}
			</div>
			<div className="ml-auto flex flex-wrap items-center gap-2.5">
				{corpusVersion?.kind === "version" ? (
					<CorpusPill hash={corpusVersion.digest} />
				) : (
					<span className="text-12 text-muted-foreground">
						{corpusMeasurementReading(corpusVersion)}
					</span>
				)}
				{row.progress.state === "running" ? <HeaderControls row={row} /> : null}
			</div>
		</header>
	);
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
		record.stages[0]
	);
}

/**
 * A pipeline run keeps one identity while its evidence is read in three views.
 */
export function RunDetailPage({
	run,
	search,
}: {
	readonly run: string;
	readonly search: RunDetailSearch;
}): React.JSX.Element | null {
	const history = useQuery(polledRunListingQuery);
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
		void queryClient.invalidateQueries({ queryKey: ["session-history"] });
		void queryClient.invalidateQueries({ queryKey: ["stage-corpus"] });
		void queryClient.invalidateQueries({ queryKey: [STAGE_OUTPUT_KEY, run] });
		void queryClient.invalidateQueries({
			queryKey: [FINAL_ASSESSMENT_KEY, run],
		});
		// A stage the run finishes becomes an attempt at its checkpoint.
		void queryClient.invalidateQueries({
			queryKey: [STAGE_ATTEMPTS_KEY, run],
		});
	});
	const unreadable = (
		<p role="alert" className="page-gutter py-4 text-attention">
			<span aria-hidden="true">⚠ </span>
			Could not read run {run}.
		</p>
	);
	if (history.isError && history.data === undefined) {
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
	if (record.isError && record.data === undefined) {
		return unreadable;
	}
	if (record.data === undefined) {
		return null;
	}

	return (
		<RunWorkspace
			key={run}
			row={row}
			record={record.data}
			search={search}
			analysis={analyses.isError ? "unreadable" : analyses.data}
			analysisInFlight={analysisInFlight}
		/>
	);
}

function RunEvents({ run }: { readonly run: string }): null {
	useRunEventsStream(run);
	return null;
}

function RunActivity({
	run,
	number,
	stage,
}: {
	readonly run: string;
	readonly number: number;
	readonly stage: MonitoredStage;
}): React.JSX.Element {
	return (
		<div className="flex min-h-180 flex-1 basis-0 flex-col lg:min-h-70.75">
			<StagePanes run={run} number={number} stage={stage} />
		</div>
	);
}

function RunWorkspace({
	row,
	record,
	search,
	analysis,
	analysisInFlight,
}: {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
	readonly search: RunDetailSearch;
	readonly analysis: AnalysisReadingResponse | "unreadable" | undefined;
	readonly analysisInFlight: boolean;
}): React.JSX.Element {
	const navigate = useNavigate();
	const [openedView] = useState<RunWorkspaceView>(
		row.progress.state === "running" ? "activity" : "results",
	);
	const view =
		search.view ?? (search.layout === undefined ? openedView : "results");
	const [lastLiveStep, setLastLiveStep] = useState(
		selectedStage(row, record, search.step)?.stage,
	);
	const runningStep =
		row.progress.state === "running" ? row.progress.stage : undefined;
	useEffect(() => {
		if (search.step === undefined && runningStep !== undefined) {
			setLastLiveStep(runningStep);
		}
	}, [runningStep, search.step]);
	const selected = selectedStage(
		row,
		record,
		search.step ?? runningStep ?? lastLiveStep,
	);
	const choose = (nextView: RunWorkspaceView, step = selected?.stage): void => {
		void navigate({
			to: "/runs/$run",
			params: { run: row.run },
			search: { view: nextView, step },
		});
	};
	const number =
		selected === undefined ? 0 : record.stages.indexOf(selected) + 1;

	return (
		<section
			aria-label="Run workspace"
			data-view={view}
			className="flex min-h-full flex-col data-[view=activity]:h-full data-[view=activity]:min-h-0"
		>
			{row.progress.state === "running" ? <RunEvents run={row.run} /> : null}
			<RunDetailHeader row={row} record={record} />
			{row.progress.state === "running" ? (
				<SpendBand
					run={row.run}
					stages={record.stages}
					progress={row.progress}
				/>
			) : null}
			<div className="flex flex-none flex-wrap items-center gap-4 border-b border-divider page-gutter py-4">
				<Switcher
					label="Run views"
					options={RUN_WORKSPACE_VIEWS}
					selected={view}
					onSelect={(next) => {
						choose(next);
					}}
					optionLabel={(option) => VIEW_LABELS[option]}
				/>
				<span className="ml-auto font-mono text-12 text-dim">
					{selected?.stage}
				</span>
			</div>
			<TaskGraph
				record={record}
				compact={view !== "activity"}
				row={row}
				shown={selected?.stage}
				onSelect={(step) => {
					choose(view, step);
				}}
			/>
			{selected === undefined || view === "results" ? null : (
				<SelectedStepActions
					row={row}
					record={record}
					selected={selected}
					number={number}
				/>
			)}
			{view === "activity" && selected !== undefined ? (
				<RunActivity run={row.run} number={number} stage={selected} />
			) : null}
			{view === "context" && selected !== undefined ? (
				<>
					<SelectedStepResources selected={selected} />
					<SessionHistoryPage
						key={`${row.run}:${selected.stage}`}
						identity={{ kind: "stage", run: row.run, stage: selected.stage }}
						embedded
						revealEvents={search.focus === "events"}
						initialEventId={search.event}
					/>
					<details className="mx-5 sm:mx-8 mb-5 rounded-lg border border-border">
						<summary className="cursor-pointer px-4 py-3 text-14">
							Run setup &amp; provenance
						</summary>
						<RunSetup row={row} record={record} selected={selected} />
					</details>
				</>
			) : null}
			{view === "results" ? (
				<RunResults
					row={row}
					record={record}
					search={search}
					analysis={analysis}
					analysisInFlight={analysisInFlight}
					selected={selected}
					number={number}
				/>
			) : null}
		</section>
	);
}

function SelectedStepResources({
	selected,
}: {
	readonly selected: MonitoredStage;
}): React.JSX.Element {
	return (
		<dl
			aria-label="Selected step resources"
			className="mx-5 sm:mx-8 mt-4 flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-border bg-card px-4 py-3 text-12"
		>
			<div>
				<dt className="text-dim">{selected.stage} · step cost</dt>
				<dd className="mt-1 font-mono">{stageCostReading(selected)}</dd>
			</div>
			<div>
				<dt className="text-dim">Execution</dt>
				<dd className="mt-1 font-mono">
					{selected.sessionCost.state === "available"
						? spendReading(selected.sessionCost.usd)
						: selected.sessionCost.reasons.join("; ")}
				</dd>
			</div>
			<div>
				<dt className="text-dim">Judge</dt>
				<dd className="mt-1 font-mono">
					{selected.judgeCost.state === "available"
						? spendReading(selected.judgeCost.usd)
						: selected.judgeCost.reasons.join("; ")}
				</dd>
			</div>
			<div>
				<dt className="text-dim">Step wall time</dt>
				<dd className="mt-1 font-mono">{wallTimeReading(selected)}</dd>
			</div>
		</dl>
	);
}

interface StepActions {
	readonly skill: string | undefined;
	readonly replayable: boolean;
}

function stepActions(
	row: PipelineRow,
	record: RunRecordResponse,
	selected: MonitoredStage,
): StepActions {
	return {
		skill:
			selected.readManifest.state === "available"
				? selected.readManifest.entries.find(
						({ role, half }) => role === "stage skill" && half === "corpus",
					)?.path
				: undefined,
		replayable:
			row.replayableStages.includes(selected.stage) &&
			hasRunEnded(row) &&
			stageReplayRefusal(record, selected.stage) === undefined,
	};
}

function SelectedStepActions({
	row,
	record,
	selected,
	number,
}: {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
	readonly selected: MonitoredStage;
	readonly number: number;
}): React.JSX.Element {
	const { skill, replayable } = stepActions(row, record, selected);

	return (
		<div className="flex flex-none flex-wrap items-center gap-2 border-b border-divider page-gutter py-2">
			<span className="mr-auto text-12 text-muted-foreground">
				Selected step ·{" "}
				<span className="font-medium text-foreground">{selected.stage}</span>
			</span>
			<StepModalAction
				run={row.run}
				record={record}
				stage={selected}
				number={number}
			/>
			{replayable ? (
				<ReplayButton
					run={row.run}
					record={record}
					stage={selected.stage}
					label={`Replay step ${String(number)}`}
				/>
			) : null}
			{replayable && skill !== undefined ? (
				<Button asChild size="compact">
					<Link
						to="/corpus"
						search={{
							file: skill,
							sourceRun: row.run,
							sourceStep: selected.stage,
						}}
					>
						Edit instruction &amp; replay
					</Link>
				</Button>
			) : null}
		</div>
	);
}

function RunResults({
	row,
	record,
	search,
	analysis,
	analysisInFlight,
	selected,
	number,
}: {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
	readonly search: RunDetailSearch;
	readonly analysis: AnalysisReadingResponse | "unreadable" | undefined;
	readonly analysisInFlight: boolean;
	readonly selected: MonitoredStage | undefined;
	readonly number: number;
}): React.JSX.Element {
	const history = useQuery(polledRunHistoryQuery);
	const rows = (history.data?.rows ?? []).filter(
		(each): each is PipelineRowWithStaleness => each.kind === "run",
	);
	const [criteriaOpen, setCriteriaOpen] = useState(false);
	const assessment = useQuery({
		...finalAssessmentQuery(row.run),
		enabled: record.finalOutcome.status === "JUDGED",
	});
	const finalCitations =
		assessment.data?.state === "available" &&
		assessment.data.requirements.some(({ status }) => status === "FAIL");
	return (
		<div className="flex flex-col gap-6 page-gutter py-8">
			<TaskGradeCard
				row={row}
				rows={rows}
				outcome={record.finalOutcome}
				assessment={assessment.data}
				assessmentError={assessment.isError}
				assessmentLoading={assessment.isLoading}
				criteriaOpen={criteriaOpen}
				onCriteriaOpenChange={setCriteriaOpen}
			/>
			{selected === undefined ? null : (
				<ResultNextAction
					row={row}
					record={record}
					selected={selected}
					number={number}
					finalCitations={finalCitations}
					onInspectFinal={() => {
						setCriteriaOpen(true);
					}}
				/>
			)}
			{selected === undefined ? null : (
				<div className="grid items-start gap-6 2xl:grid-cols-main-aside">
					<StepReport
						run={row.run}
						row={row}
						record={record}
						stage={selected}
						number={number}
					/>
					<aside className="min-w-0">
						<CheckpointAttempts run={row.run} stage={selected} />
						{selected.grade.state === "available" ? (
							<p className="mt-4">
								<Link
									to="/calibration/runs/$run/stages/$stage"
									params={{ run: row.run, stage: selected.stage }}
									className="text-14 text-link underline underline-offset-4"
								>
									Review this Judge
								</Link>
							</p>
						) : null}
					</aside>
				</div>
			)}
			<details className="rounded-lg border border-border">
				<summary className="cursor-pointer px-4 py-3 text-14">
					Human review · {humanReviewReading(row, record)}
				</summary>
				<HumanReview record={record} />
			</details>
			<details className="rounded-lg border border-border">
				<summary className="cursor-pointer px-4 py-3 text-14">
					Root-cause analysis · agent opinion
				</summary>
				<RootCauseAnalysisSection
					run={row.run}
					record={record}
					reading={analysis}
					wait={analysisWait({
						runEnded: hasRunEnded(row),
						analysisInFlight,
					})}
				/>
			</details>
			<WorkflowRecord
				row={row}
				record={record}
				analysis={analysis}
				initiallyOpen={search.layout === "ledger" || search.layout === "trace"}
			/>
			{selected === undefined ? null : (
				<details className="rounded-lg border border-border">
					<summary className="cursor-pointer px-4 py-3 text-14 text-muted-foreground">
						Run setup & provenance
					</summary>
					<RunSetup row={row} record={record} selected={selected} />
				</details>
			)}
		</div>
	);
}

function ResultNextAction({
	row,
	record,
	selected,
	number,
	finalCitations,
	onInspectFinal,
}: {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
	readonly selected: MonitoredStage;
	readonly number: number;
	readonly finalCitations: boolean;
	readonly onInspectFinal: () => void;
}): React.JSX.Element {
	const { skill, replayable } = stepActions(row, record, selected);
	const endedAt = defaultEndedStage(row, record);
	const failedFinal =
		record.finalOutcome.status === "JUDGED" &&
		record.finalOutcome.verdict === "FAIL";
	let primary: React.ReactNode;
	if (row.progress.state === "running") {
		primary = (
			<Button variant="primary" asChild>
				<Link
					to="/runs/$run"
					params={{ run: row.run }}
					search={{ view: "activity", step: selected.stage }}
				>
					Follow activity
				</Link>
			</Button>
		);
	} else if (selected.status === "no-record" && endedAt !== undefined) {
		primary = (
			<Button variant="primary" asChild>
				<Link
					to="/runs/$run"
					params={{ run: row.run }}
					search={{ view: "results", step: endedAt.stage }}
				>
					Inspect ended step
				</Link>
			</Button>
		);
	} else if (failedFinal && finalCitations) {
		primary = (
			<Button variant="primary" asChild>
				<a href="#final-criteria" onClick={onInspectFinal}>
					Inspect final evidence
				</a>
			</Button>
		);
	} else if (failedFinal) {
		primary = (
			<Button variant="primary" asChild>
				<a href="#task-grade-label">Review final outcome</a>
			</Button>
		);
	} else if (replayable && skill !== undefined) {
		primary = (
			<Button variant="primary" asChild>
				<Link
					to="/corpus"
					search={{
						file: skill,
						sourceRun: row.run,
						sourceStep: selected.stage,
					}}
				>
					Edit instruction &amp; replay
				</Link>
			</Button>
		);
	} else {
		primary = (
			<Button variant="primary" asChild>
				<Link
					to="/runs/$run"
					params={{ run: row.run }}
					search={{ view: "activity", step: selected.stage }}
				>
					Inspect activity
				</Link>
			</Button>
		);
	}
	return (
		<section
			aria-label="Next action"
			className="flex flex-wrap items-center gap-4 rounded-lg border border-divider bg-card p-5"
		>
			<h2 className="text-16 font-semibold">Next action</h2>
			{primary}
			{replayable && skill !== undefined && failedFinal ? (
				<Link
					to="/corpus"
					search={{
						file: skill,
						sourceRun: row.run,
						sourceStep: selected.stage,
					}}
					className="text-14 text-link underline"
				>
					Edit instruction &amp; replay
				</Link>
			) : null}
			{replayable ? (
				<ReplayButton
					run={row.run}
					record={record}
					stage={selected.stage}
					label={`Replay step ${String(number)}`}
				/>
			) : null}
		</section>
	);
}

function WorkflowRecord({
	row,
	record,
	analysis,
	initiallyOpen,
}: {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
	readonly analysis: AnalysisReadingResponse | "unreadable" | undefined;
	readonly initiallyOpen: boolean;
}): React.JSX.Element {
	const [expanded, setExpanded] = useState(initiallyOpen);
	return (
		<details
			open={expanded}
			onToggle={(event) => {
				setExpanded(event.currentTarget.open);
			}}
			className="rounded-lg border border-border"
		>
			<summary className="cursor-pointer px-4 py-3 text-14 text-muted-foreground">
				Whole workflow record &amp; analysis map
			</summary>
			{expanded ? (
				<>
					<div className="px-4 py-3">
						<StepMap
							record={record}
							roles={rolesOf(analysis === "unreadable" ? undefined : analysis)}
						/>
					</div>
					<RecordLedger row={row} record={record} />
				</>
			) : null}
		</details>
	);
}

function HumanReview({
	record,
}: {
	readonly record: RunRecordResponse;
}): React.JSX.Element {
	const reading = record.humanReview;
	return (
		<section
			aria-label="Human review"
			className="rounded-lg border border-border p-4"
		>
			<h2 className="text-16 font-semibold">Human review</h2>
			{reading?.state === "available" ? (
				<>
					<p className="mt-2 font-mono text-14">{reading.review.verdict}</p>
					<p className="mt-1 whitespace-pre-wrap text-14 leading-reading text-secondary-foreground">
						{reading.review.summary}
					</p>
					<ul className="mt-3 flex flex-col gap-3 text-14 leading-reading">
						{reading.review.findings.map((finding, index) => (
							<li key={index}>
								<p>{finding.description}</p>
								<p className="mt-1 text-12 text-dim">
									{finding.stage} · {finding.judgeAssessment}
									{finding.rubricId === null ? "" : ` · ${finding.rubricId}`}
								</p>
								<p className="font-mono text-12 wrap-anywhere text-muted-foreground">
									{finding.paths.join(", ")}
								</p>
							</li>
						))}
					</ul>
				</>
			) : (
				<p className="mt-2 text-14 text-attention">
					{reading?.reasons.join("; ") ??
						"Human review is unavailable in this record"}
				</p>
			)}
		</section>
	);
}
