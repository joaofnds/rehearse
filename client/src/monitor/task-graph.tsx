import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "#client/system/ui/button";
import {
	corpusMeasurementReading,
	corpusVersionHash,
} from "#benchmark/corpus-version-label";
import type { AnalyzedStage } from "#client/run-detail/analysis-query";
import { analysesQuery, rolesOf } from "#client/run-detail/analysis-query";
import { liveElapsedMs, spendReading } from "#client/run-history/run-progress";
import { hasRunEnded } from "#client/run-history/run-status";
import {
	isStopped,
	stoppedStageOf,
	isPaused,
	pausedStageOf,
} from "#benchmark/stopped-status";
import { useNow } from "#client/run-history/use-now";
import type { PipelineRow } from "#client/shell/run-in-flight";
import { Grade } from "#client/system/components/grade";
import { LiveGlyph, STATUS_VOCABULARY } from "#client/system/components/status";
import type { StatusState } from "#client/system/components/status";
import { withinCase } from "#client/within-case";
import { continuationReading, endedStatus, hasEnded } from "./run-record-query";
import type { MonitoredStage, RunRecordResponse } from "./run-record-query";
import { minutesAndSeconds } from "./minutes-and-seconds";
import { stageSessionQuery } from "./stage-session-query";

const NOT_RECORDED = "—";

export interface NodeStatus {
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

export function nodeStatus(
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
		if (hasRunEnded(row)) {
			return { state: "interrupted", words: "judge never returned" };
		}
		return { state: "pending", words: "awaiting judgment" };
	}
	if (hasRunEnded(row)) {
		const stopped = stoppedAfter(row.status);
		const stoppedIndex = record.stages.findIndex(
			(each) => each.stage === stopped,
		);
		const index = record.stages.indexOf(stage);
		return stoppedIndex !== -1 && index > stoppedIndex
			? { state: "queued", words: "never ran" }
			: { state: "interrupted", words: "step record missing" };
	}

	return { state: "queued", words: STATUS_VOCABULARY.queued.word };
}

/** Whether a running stage's spend figure, by its scope, is the stage's own. */
const SCOPE_IS_OWN_SPEND = {
	"the stages finished before this one": false,
	"this stage's session so far": true,
	"this stage's session": true,
	"this stage's session and its judge": true,
} as const satisfies Record<RunningProgress["spendScope"], boolean>;

/**
 * What the stage has cost: the running stage's own spend, as the run measured
 * it at its latest event, or else its session and judge cost as its record
 * keeps them. A stage not started has spent nothing.
 */
export function costReading(stage: MonitoredStage, row: PipelineRow): string {
	const progress = liveProgress(stage, row);
	if (progress !== undefined) {
		return spendReading(
			SCOPE_IS_OWN_SPEND[progress.spendScope] ? progress.spentUsd : 0,
		);
	}
	if (notStarted(stage, row)) {
		return hasRunEnded(row) ? NOT_RECORDED : spendReading(0);
	}

	const parts = [stage.sessionCost, stage.judgeCost].flatMap((part) =>
		part.state === "available" ? [part.usd] : [],
	);

	return parts.length === 0
		? NOT_RECORDED
		: spendReading(parts.reduce((total, usd) => total + usd, 0));
}

/**
 * How long the stage has run: the running stage's time since it started,
 * advancing between the run's measurements (SPEC.md:354), or else the wall
 * time its record keeps.
 */
export function durationReading(
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

/**
 * The running stage's latest tool call, as its session pane reads it. A
 * session with no tool call yet draws no chip.
 */
function LiveToolCall({
	run,
	stage,
}: {
	readonly run: string;
	readonly stage: string;
}): React.JSX.Element | null {
	const { data } = useQuery(stageSessionQuery(run, stage));
	if (data?.state !== "running" || data.latestToolCall === undefined) {
		return null;
	}

	return (
		<span className="block truncate rounded-tight border border-accent-line bg-raised px-2.25 py-1.25 font-mono text-12 text-pale">
			{data.latestToolCall}
		</span>
	);
}

function StatusLine({
	status,
}: {
	readonly status: NodeStatus;
}): React.JSX.Element {
	return (
		<span className="flex items-center gap-1.75 text-12 text-secondary-foreground">
			{status.state === "running" ? (
				<LiveGlyph tone="surrounding" />
			) : (
				<span aria-hidden="true">{STATUS_VOCABULARY[status.state].glyph}</span>
			)}
			{status.words}
		</span>
	);
}

/**
 * The stage's checkpoint, named by its short id. A run recorded before short
 * ids still has a checkpoint to replay from, so the line says so.
 */
function CheckpointLine({
	stage,
	caseId,
	ended,
}: {
	readonly stage: MonitoredStage;
	readonly caseId: string;
	readonly ended: boolean;
}): React.JSX.Element {
	if (stage.checkpoint === "missing") {
		return (
			<span className="flex items-center gap-1.75 border-t border-dashed border-strong pt-1.75 font-mono text-12 text-dim">
				<span aria-hidden="true">◇</span>
				{ended ? "no checkpoint recorded" : "no checkpoint yet"}
			</span>
		);
	}

	return (
		<span className="flex items-center gap-1.75 border-t border-dashed border-strong pt-1.75 font-mono text-12 text-secondary-foreground">
			<span aria-hidden="true">◆</span>
			{stage.checkpointShortId.state === "available"
				? withinCase(stage.checkpointShortId.shortId, caseId)
				: "checkpoint recorded"}
		</span>
	);
}

function counted(count: number, noun: string): string {
	return `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
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
			commitSubjects.subjects.length > 0 &&
			counted(commitSubjects.subjects.length, "commit"),
		changedPaths.state === "available" &&
			changedPaths.paths.length > 0 &&
			countReading(changedPaths.paths.length, "file", "changed"),
		workflowState.state === "available" &&
			workflowState.changes.length > 0 &&
			counted(workflowState.changes.length, "workflow-state change"),
	].filter((part) => part !== false);

	return parts.length === 0 ? undefined : `produced ${parts.join(", ")}`;
}

function nodeBorder(selected: boolean, status: NodeStatus): string {
	if (selected) {
		return "border-primary bg-selected";
	}

	return status.state === "running" ? "border-deeper" : "border-border";
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

function StageNode({
	stage,
	number,
	record,
	row,
	last,
	selected,
	onSelect,
	nowMs,
	contribution,
	detailsShown,
}: {
	readonly stage: MonitoredStage;
	readonly number: number;
	readonly record: RunRecordResponse;
	readonly row: PipelineRow;
	readonly last: boolean;
	readonly selected: boolean;
	readonly onSelect: (stage: string) => void;
	readonly nowMs: number;
	/** The newest analysis's phrase for the step toward the task grade. */
	readonly contribution: string | undefined;
	readonly detailsShown: boolean;
}): React.JSX.Element {
	const status = nodeStatus(stage, row, record);

	return (
		<li className="flex items-stretch">
			<button
				type="button"
				aria-current={selected ? "step" : undefined}
				onClick={() => {
					onSelect(stage.stage);
				}}
				className={`flex w-67.5 flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-left ${nodeBorder(selected, status)}`}
			>
				<span className="flex items-center gap-2.5">
					<span aria-hidden="true" className="font-mono text-12 text-dim">
						{String(number).padStart(2, "0")}
					</span>
					<span className="flex-1 text-14 text-foreground">{stage.stage}</span>
					<Grade
						size="node"
						value={
							stage.grade.state === "available"
								? { letter: stage.grade.letter }
								: { pending: true }
						}
					/>
				</span>
				<StatusLine status={status} />
				{detailsShown && isRunning(stage, row) ? (
					<LiveToolCall run={row.run} stage={stage.stage} />
				) : null}
				{detailsShown ? (
					<>
						<span className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-12 text-muted-foreground">
							<span>{costReading(stage, row)}</span>
							<span>{durationReading(stage, row, nowMs)}</span>
							<span>{blockersReading(stage.blockers)}</span>
							<span className="truncate">
								{notStarted(stage, row) ? (
									<>
										—
										<span className="sr-only">
											{" "}
											corpus version not recorded
										</span>
									</>
								) : (
									corpusReading(stage, row)
								)}
							</span>
						</span>
						<CheckpointLine
							stage={stage}
							caseId={record.caseId}
							ended={hasRunEnded(row)}
						/>
						<span className="text-12 text-muted-foreground">
							{outputReading(stage, row, contribution)}
						</span>
					</>
				) : null}
			</button>
			{last ? null : (
				<span
					aria-hidden="true"
					className={`flex items-center gap-1 px-2.5 ${status.state === "accepted" ? "text-deeper" : "text-strong"}`}
				>
					<span className="block h-px w-7.5 bg-current" />
					<span className="text-12">▶</span>
				</span>
			)}
		</li>
	);
}

/**
 * What a stage below the minimum grade does to the run. A run whose manifest
 * predates the minimum grade has none to state.
 */
function MinimumGradeNote({
	record,
}: {
	readonly record: RunRecordResponse;
}): React.JSX.Element | null {
	if (record.minimumGrade.state === "unavailable") {
		return null;
	}

	return (
		<>
			Minimum grade for every step in this task is{" "}
			<span className="font-mono text-secondary-foreground">
				{record.minimumGrade.letter}
			</span>
			. A step below it stops the run.{" "}
		</>
	);
}

function contributionOf(
	analysed: AnalyzedStage | undefined,
): string | undefined {
	return analysed === undefined || analysed.role === "never ran"
		? undefined
		: analysed.contribution;
}

/** The monitor's task graph (SPEC.md 2c): the run's stages as a chain of node cards. */
export function TaskGraph({
	record,
	row,
	shown,
	onSelect,
	compact = false,
}: {
	readonly record: RunRecordResponse;
	readonly row: PipelineRow;
	/** The stage the panes below show, marked current as the design marks it. */
	readonly shown: string | undefined;
	readonly onSelect: (stage: string) => void;
	readonly compact?: boolean;
}): React.JSX.Element {
	const nowMs = useNow(row.progress.state === "running");
	const analyses = useQuery(analysesQuery(row.run));
	const roles = rolesOf(analyses.data);
	const [expanded, setExpanded] = useState(false);
	const detailsShown = !compact || expanded;

	return (
		<section
			aria-label="Task graph"
			className="flex-none border-b border-divider bg-secondary"
		>
			<div className="flex flex-wrap items-center gap-x-3.75 gap-y-1 page-gutter pt-2.5">
				<h2 className="text-16 font-semibold text-dim wrap-anywhere">
					<span className="tracking-label uppercase">Workflow</span> ·{" "}
					{record.caseId} · {String(record.stages.length)} steps, in order
				</h2>
				<span className="text-12 text-muted-foreground">
					select a step to explore its results, activity and context
				</span>
				{compact ? (
					<div className="ml-auto">
						<Button
							size="compact"
							variant="ghost"
							aria-expanded={expanded}
							onClick={() => {
								setExpanded(!expanded);
							}}
						>
							{expanded ? "Hide workflow details" : "Show workflow details"}
						</Button>
					</div>
				) : null}
				{detailsShown ? (
					<span aria-hidden="true" className="ml-auto text-12 text-dim">
						✓ continued at minimum · ● running · ○ queued · ◆ checkpoint · ◇ no
						checkpoint
					</span>
				) : null}
			</div>
			<div
				role="region"
				aria-label="Workflow steps"
				tabIndex={0}
				className="relative overflow-x-auto page-gutter pt-2.5 pb-3"
			>
				<ol className="flex min-w-max items-stretch">
					{record.stages.map((stage, index) => (
						<StageNode
							key={stage.stage}
							stage={stage}
							number={index + 1}
							record={record}
							row={row}
							last={index === record.stages.length - 1}
							selected={stage.stage === shown}
							onSelect={onSelect}
							nowMs={nowMs}
							contribution={contributionOf(roles.get(stage.stage))}
							detailsShown={detailsShown}
						/>
					))}
				</ol>
			</div>
			{detailsShown ? (
				<p className="page-gutter pb-2.5 text-12 text-pretty text-dim">
					<MinimumGradeNote record={record} />A step shows what its record says
					it produced until an analysis of the ended run gives one agent's
					reading of its contribution to the task's final grade.
				</p>
			) : null}
		</section>
	);
}
