import { useQuery } from "@tanstack/react-query";
import {
	corpusMeasurementReading,
	corpusVersionHash,
} from "#benchmark/corpus-version-label";
import { LaunchDialog } from "#client/launch/launch-dialog";
import { liveElapsedMs, spendReading } from "#client/run-history/run-progress";
import { useNow } from "#client/run-history/use-now";
import type { PipelineRow } from "#client/shell/run-in-flight";
import { Grade } from "#client/system/components/grade";
import { LiveGlyph, STATUS_VOCABULARY } from "#client/system/components/status";
import type { StatusState } from "#client/system/components/status";
import { Button } from "#client/system/ui/button";
import type { MonitoredStage, RunRecordResponse } from "./run-record-query";
import { shortCommit } from "./run-identity-header";
import { stageSessionQuery } from "./stage-session-query";

const MS_PER_SECOND = 1000;

const SECONDS_PER_MINUTE = 60;

const NOT_RECORDED = "—";

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

function nodeStatus(stage: MonitoredStage, row: PipelineRow): NodeStatus {
	const progress = liveProgress(stage, row);
	if (progress !== undefined) {
		return { state: "running", words: progress.stageState };
	}
	if (stage.status === "stopped") {
		return { state: "stopped", words: STATUS_VOCABULARY.stopped.word };
	}
	if (stage.status === "graded") {
		return stage.grade.state === "available" && !stage.grade.reachesMinimum
			? { state: "stopped", words: STATUS_VOCABULARY.stopped.word }
			: { state: "accepted", words: STATUS_VOCABULARY.accepted.word };
	}
	if (stage.status === "awaiting-judgment") {
		return { state: "pending", words: "awaiting judgment" };
	}

	return { state: "queued", words: STATUS_VOCABULARY.queued.word };
}

/**
 * What the stage has cost: the running stage's session spend so far, as the
 * run measured it at its latest event, or else its session and judge cost as
 * its record keeps them. A stage not started has spent nothing.
 */
function costReading(stage: MonitoredStage, row: PipelineRow): string {
	const progress = liveProgress(stage, row);
	if (progress !== undefined) {
		return spendReading(progress.spentUsd);
	}
	if (notStarted(stage, row)) {
		return spendReading(0);
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

export function minutesAndSeconds(ms: number): string {
	const totalSeconds = Math.floor(ms / MS_PER_SECOND);
	const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
	const seconds = totalSeconds % SECONDS_PER_MINUTE;

	return `${String(minutes)}m${String(seconds).padStart(2, "0")}s`;
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
		<span className="block truncate rounded-tight border border-accent-line bg-raised px-2.25 py-1.25 font-mono text-10-5 text-pale">
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
		<span className="flex items-center gap-1.75 text-11-5 text-secondary-foreground">
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
}: {
	readonly stage: MonitoredStage;
}): React.JSX.Element {
	if (stage.checkpoint === "missing") {
		return (
			<span className="flex items-center gap-1.75 border-t border-dashed border-strong pt-1.75 font-mono text-10-5 text-dim">
				<span aria-hidden="true">◇</span>
				no checkpoint yet
			</span>
		);
	}

	return (
		<span className="flex items-center gap-1.75 border-t border-dashed border-strong pt-1.75 font-mono text-10-5 text-secondary-foreground">
			<span aria-hidden="true">◆</span>
			{stage.checkpointShortId.state === "available"
				? stage.checkpointShortId.shortId
				: "checkpoint recorded"}
		</span>
	);
}

function countReading(count: number, noun: string, direction: string): string {
	return `${String(count)} ${noun}${count === 1 ? "" : "s"} ${direction}`;
}

/** The instruction files the stage loaded and the artifacts it declared. */
function InOutLine({
	stage,
}: {
	readonly stage: MonitoredStage;
}): React.JSX.Element {
	const { instructionFiles } = stage;
	const { declared } = stage.artifactsOut;

	return (
		<span className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-10-5 text-secondary-foreground">
			<span>
				↓{" "}
				{instructionFiles.state === "available"
					? countReading(
							instructionFiles.files.length,
							"instruction file",
							"in",
						)
					: NOT_RECORDED}
			</span>
			<span>
				↑{" "}
				{declared.state === "available"
					? countReading(declared.paths.length, "artifact", "out")
					: NOT_RECORDED}
			</span>
		</span>
	);
}

/**
 * Replay opens the launch dialog on the stage's checkpoint. A stage without
 * one keeps the action in its place, disabled with the reason, as the design
 * draws it.
 */
function ReplayAction({
	run,
	stage,
}: {
	readonly run: string;
	readonly stage: MonitoredStage;
}): React.JSX.Element {
	if (stage.checkpoint === "missing") {
		return (
			<Button
				variant="quiet"
				size="xs"
				aria-disabled="true"
				aria-label={`${stage.stage} has no checkpoint to replay from`}
			>
				replay
			</Button>
		);
	}

	return (
		<LaunchDialog
			target={{ kind: "replay", run, stage: stage.stage }}
			trigger={
				<Button
					variant="quiet"
					size="xs"
					aria-label={`Replay ${stage.stage} from its checkpoint`}
				>
					replay
				</Button>
			}
		/>
	);
}

function nodeBorder(selected: boolean, status: NodeStatus): string {
	if (selected) {
		return "border-primary bg-selected";
	}

	return status.state === "running" ? "border-deeper" : "border-border";
}

function StageNode({
	stage,
	number,
	row,
	last,
	selected,
	onSelect,
	nowMs,
}: {
	readonly stage: MonitoredStage;
	readonly number: number;
	readonly row: PipelineRow;
	readonly last: boolean;
	readonly selected: boolean;
	readonly onSelect: (stage: string) => void;
	readonly nowMs: number;
}): React.JSX.Element {
	const status = nodeStatus(stage, row);

	return (
		<li className="flex items-stretch">
			<button
				type="button"
				aria-current={selected ? "step" : undefined}
				onClick={() => {
					onSelect(stage.stage);
				}}
				className={`flex w-77.5 flex-col gap-2.25 rounded-lg border px-3.75 py-3 text-left ${nodeBorder(selected, status)}`}
			>
				<span className="flex items-center gap-2.5">
					<span aria-hidden="true" className="font-mono text-10-5 text-dim">
						{String(number).padStart(2, "0")}
					</span>
					<span className="flex-1 text-13 text-foreground">{stage.stage}</span>
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
				{isRunning(stage, row) ? (
					<LiveToolCall run={row.run} stage={stage.stage} />
				) : null}
				<span className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-10-5 text-muted-foreground">
					<span>{costReading(stage, row)}</span>
					<span>{durationReading(stage, row, nowMs)}</span>
					<span>{blockersReading(stage.blockers)}</span>
					<span className="truncate">{corpusReading(stage, row)}</span>
				</span>
				<CheckpointLine stage={stage} />
				<span className="text-11 text-muted-foreground">
					{notStarted(stage, row) ? "not started" : "contribution pending"}
				</span>
				<InOutLine stage={stage} />
			</button>
			<span className="flex flex-col justify-center gap-1.25 px-1.5">
				<ReplayAction run={row.run} stage={stage} />
			</span>
			{last ? null : (
				<span
					aria-hidden="true"
					className={`flex items-center gap-1 px-2.5 ${status.state === "accepted" ? "text-deeper" : "text-strong"}`}
				>
					<span className="block h-px w-7.5 bg-current" />
					<span className="text-10">▶</span>
				</span>
			)}
		</li>
	);
}

/**
 * What a stage below the minimum grade does to the run, stated under the
 * graph. A run whose manifest predates the minimum grade has none to state.
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
		<p className="px-5 pb-3 text-11 text-pretty text-dim">
			Minimum grade for every step in this task is{" "}
			<span className="font-mono text-secondary-foreground">
				{record.minimumGrade.letter}
			</span>
			. A task below it stops the run and restores{" "}
			<span className="font-mono">{record.identity.target}</span> to{" "}
			<span className="font-mono">{shortCommit(record.identity.commit)}</span>.
			Contribution is measured against the task's final grade and is provisional
			until the run ends.
		</p>
	);
}

/** The monitor's task graph (SPEC.md 2c): the run's stages as a chain of node cards. */
export function TaskGraph({
	record,
	row,
	shown,
	onSelect,
}: {
	readonly record: RunRecordResponse;
	readonly row: PipelineRow;
	/** The stage the panes below show, marked current as the design marks it. */
	readonly shown: string | undefined;
	readonly onSelect: (stage: string) => void;
}): React.JSX.Element {
	const nowMs = useNow(row.progress.state === "running");

	return (
		<section
			aria-label="Task graph"
			className="min-h-66.25 overflow-y-auto border-b border-divider bg-secondary"
		>
			<div className="flex items-center gap-3.75 px-5 pt-2.5">
				<h2 className="text-10 font-medium tracking-label text-dim uppercase">
					Task · {record.caseId} · {String(record.stages.length)} steps, in
					order
				</h2>
				<span className="text-11 text-muted-foreground">
					click a step to bring its session and judge below
				</span>
				<span aria-hidden="true" className="ml-auto text-10-5 text-dim">
					✓ accepted · ● running · ○ queued · ◆ checkpoint
				</span>
			</div>
			<div className="overflow-x-auto px-5 pt-3 pb-3.75">
				<ol className="flex min-w-max items-stretch">
					{record.stages.map((stage, index) => (
						<StageNode
							key={stage.stage}
							stage={stage}
							number={index + 1}
							row={row}
							last={index === record.stages.length - 1}
							selected={stage.stage === shown}
							onSelect={onSelect}
							nowMs={nowMs}
						/>
					))}
				</ol>
			</div>
			<MinimumGradeNote record={record} />
		</section>
	);
}
