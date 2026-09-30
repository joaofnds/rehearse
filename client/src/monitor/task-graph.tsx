import {
	corpusMeasurementReading,
	corpusVersionHash,
} from "#benchmark/corpus-version-label";
import { LaunchDialog } from "#client/launch/launch-dialog";
import { spendReading } from "#client/run-history/run-progress";
import type { PipelineRow } from "#client/shell/run-in-flight";
import { Grade } from "#client/system/components/grade";
import { LiveGlyph, STATUS_VOCABULARY } from "#client/system/components/status";
import type { StatusState } from "#client/system/components/status";
import { Button } from "#client/system/ui/button";
import type { MonitoredStage, RunRecordResponse } from "./run-record-query";

const MS_PER_SECOND = 1000;

const SECONDS_PER_MINUTE = 60;

const NOT_RECORDED = "—";

interface NodeStatus {
	readonly state: StatusState;
	readonly words: string;
}

function isRunning(stage: MonitoredStage, row: PipelineRow): boolean {
	return row.progress.state === "running" && row.progress.stage === stage.stage;
}

/** A stage the run has not reached: no record, and not the one running. */
function notStarted(stage: MonitoredStage, row: PipelineRow): boolean {
	return stage.status === "no-record" && !isRunning(stage, row);
}

function nodeStatus(stage: MonitoredStage, row: PipelineRow): NodeStatus {
	const { progress } = row;
	if (progress.state === "running" && progress.stage === stage.stage) {
		return { state: "running", words: progress.stageState };
	}
	if (stage.status === "stopped") {
		return { state: "stopped", words: STATUS_VOCABULARY.stopped.word };
	}
	if (stage.status === "graded") {
		return stage.grade.state === "available" && stage.grade.verdict === "STOP"
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
	if (row.progress.state === "running" && row.progress.stage === stage.stage) {
		return spendReading(row.progress.spentUsd);
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

function durationReading(wallTime: MonitoredStage["wallTime"]): string {
	if (wallTime.state === "unavailable") {
		return NOT_RECORDED;
	}

	const totalSeconds = Math.floor(wallTime.ms / MS_PER_SECOND);
	const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
	const seconds = totalSeconds % SECONDS_PER_MINUTE;

	return `${String(minutes)}m${String(seconds).padStart(2, "0")}s`;
}

function blockersReading(blockers: MonitoredStage["blockers"]): string {
	return blockers.state === "available"
		? `${String(blockers.fired)} of ${String(blockers.total)} fired`
		: NOT_RECORDED;
}

function corpusReading(corpusVersion: MonitoredStage["corpusVersion"]): string {
	return corpusVersion?.kind === "version"
		? corpusVersionHash(corpusVersion.digest)
		: corpusMeasurementReading(corpusVersion);
}

function StatusLine({
	status,
}: {
	readonly status: NodeStatus;
}): React.JSX.Element {
	return (
		<span className="flex items-center gap-1.5 text-sm text-secondary-foreground">
			{status.state === "running" ? (
				<LiveGlyph />
			) : (
				<span aria-hidden="true">{STATUS_VOCABULARY[status.state].glyph}</span>
			)}
			{status.words}
		</span>
	);
}

function CheckpointLine({
	shortId,
}: {
	readonly shortId: MonitoredStage["checkpointShortId"];
}): React.JSX.Element {
	return shortId.state === "available" ? (
		<span className="flex items-center gap-1.5 border-t border-dashed border-strong pt-1.5 font-mono text-xs text-secondary-foreground">
			<span aria-hidden="true">◆</span>
			{shortId.shortId}
		</span>
	) : (
		<span className="flex items-center gap-1.5 border-t border-dashed border-strong pt-1.5 font-mono text-xs text-dim">
			<span aria-hidden="true">◇</span>
			no checkpoint yet
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
}: {
	readonly stage: MonitoredStage;
	readonly number: number;
	readonly row: PipelineRow;
	readonly last: boolean;
	readonly selected: boolean;
	readonly onSelect: (stage: string) => void;
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
				className={`flex w-77.5 flex-col gap-2 rounded-lg border px-3.75 py-3 text-left hover:bg-accent ${nodeBorder(selected, status)}`}
			>
				<span className="flex items-center gap-2.5">
					<span aria-hidden="true" className="font-mono text-xs text-dim">
						{String(number)}
					</span>
					<span className="flex-1 text-base text-foreground">
						{stage.stage}
					</span>
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
				<span className="grid grid-cols-2 gap-x-2.5 gap-y-0.5 font-mono text-xs text-muted-foreground">
					<span>{costReading(stage, row)}</span>
					<span>{durationReading(stage.wallTime)}</span>
					<span>{blockersReading(stage.blockers)}</span>
					<span className="truncate">{corpusReading(stage.corpusVersion)}</span>
				</span>
				<CheckpointLine shortId={stage.checkpointShortId} />
				<span className="text-sm text-muted-foreground">
					{notStarted(stage, row) ? "not started" : "contribution pending"}
				</span>
			</button>
			<span className="flex flex-col justify-center gap-1 px-1.5">
				<ReplayAction run={row.run} stage={stage} />
			</span>
			{last ? null : (
				<span
					aria-hidden="true"
					className={`flex items-center gap-1 px-2.5 ${status.state === "accepted" ? "text-deeper" : "text-strong"}`}
				>
					<span className="block h-px w-7.5 bg-current" />
					<span className="text-xs">▶</span>
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
		<p className="px-5 pb-3 text-sm text-dim">
			Minimum grade for every step in this task is{" "}
			<span className="font-mono text-secondary-foreground">
				{record.minimumGrade.letter}
			</span>
			. A task below it stops the run and restores{" "}
			<span className="font-mono">{record.identity.target}</span> to{" "}
			<span className="font-mono">{record.identity.commit.slice(0, 6)}</span>.
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
	/** The stage the panes below show, marked when the operator selected it. */
	readonly shown: string | undefined;
	readonly onSelect: (stage: string) => void;
}): React.JSX.Element {
	return (
		<section
			aria-label="Task graph"
			className="border-b border-divider bg-secondary"
		>
			<div className="flex items-center gap-4 px-5 pt-2.5">
				<h2 className="text-xs font-medium tracking-widest text-dim uppercase">
					Task · {record.caseId} · {String(record.stages.length)} steps, in
					order
				</h2>
				<span className="text-sm text-muted-foreground">
					click a step to bring its session and judge below
				</span>
				<span aria-hidden="true" className="ml-auto text-xs text-dim">
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
						/>
					))}
				</ol>
			</div>
			<MinimumGradeNote record={record} />
		</section>
	);
}
