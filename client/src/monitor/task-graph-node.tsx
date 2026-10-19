import { useQuery } from "@tanstack/react-query";

import { hasRunEnded } from "#client/run-history/run-status";
import type { PipelineRow } from "#client/shell/run-in-flight";
import { Grade } from "#client/system/components/grade";
import { LiveGlyph, STATUS_VOCABULARY } from "#client/system/components/status";
import withinCase from "#client/within-case";

import type { MonitoredStage, RunRecordResponse } from "./run-record-query";
import { stageSessionQuery } from "./stage-session-query";
import {
	blockersReading,
	corpusReading,
	costReading,
	durationReading,
	outputReading,
} from "./task-graph-readings";
import type { NodeStatus } from "./task-graph-status";
import { isRunning, nodeStatus, notStarted } from "./task-graph-status";

const STEP_NUMBER_DIGITS = 2;

/**
 * The running stage's latest tool call, as its session pane reads it. A
 * session with no tool call yet draws no chip.
 */
interface LiveToolCallProps {
	readonly run: string;
	readonly stage: string;
}

function LiveToolCall({
	run,
	stage,
}: LiveToolCallProps): React.JSX.Element | null {
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

interface StatusLineProps {
	readonly status: NodeStatus;
}

function StatusLine({ status }: StatusLineProps): React.JSX.Element {
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
interface CheckpointLineProps {
	readonly stage: MonitoredStage;
	readonly caseId: string;
	readonly ended: boolean;
}

function CheckpointLine({
	stage,
	caseId,
	ended,
}: CheckpointLineProps): React.JSX.Element {
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

function nodeBorder(selected: boolean, status: NodeStatus): string {
	if (selected) {
		return "border-primary bg-selected";
	}

	return status.state === "running" ? "border-deeper" : "border-border";
}

interface StageNodeProps {
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
}: StageNodeProps): React.JSX.Element {
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
				<StageNodeIdentity stage={stage} number={number} />
				<StatusLine status={status} />
				{detailsShown && isRunning(stage, row) ? (
					<LiveToolCall run={row.run} stage={stage.stage} />
				) : null}
				{detailsShown ? (
					<StageNodeDetails
						stage={stage}
						row={row}
						record={record}
						nowMs={nowMs}
						contribution={contribution}
					/>
				) : null}
			</button>
			{last ? null : <StageConnection status={status} />}
		</li>
	);
}

interface StageNodeIdentityProps {
	readonly stage: MonitoredStage;
	readonly number: number;
}

function StageNodeIdentity({
	stage,
	number,
}: StageNodeIdentityProps): React.JSX.Element {
	return (
		<span className="flex items-center gap-2.5">
			<span aria-hidden="true" className="font-mono text-12 text-dim">
				{String(number).padStart(STEP_NUMBER_DIGITS, "0")}
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
	);
}

interface StageNodeDetailsProps {
	readonly stage: MonitoredStage;
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
	readonly nowMs: number;
	readonly contribution: string | undefined;
}

function StageNodeDetails({
	stage,
	row,
	record,
	nowMs,
	contribution,
}: StageNodeDetailsProps): React.JSX.Element {
	return (
		<>
			<span className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-12 text-muted-foreground">
				<span>{costReading(stage, row)}</span>
				<span>{durationReading(stage, row, nowMs)}</span>
				<span>{blockersReading(stage.blockers)}</span>
				<span className="truncate">
					{notStarted(stage, row) ? (
						<>
							—<span className="sr-only"> corpus version not recorded</span>
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
	);
}

interface StageConnectionProps {
	readonly status: NodeStatus;
}

function StageConnection({ status }: StageConnectionProps): React.JSX.Element {
	return (
		<span
			aria-hidden="true"
			className={`flex items-center gap-1 px-2.5 ${status.state === "accepted" ? "text-deeper" : "text-strong"}`}
		>
			<span className="block h-px w-7.5 bg-current" />
			<span className="text-12">▶</span>
		</span>
	);
}

export { StageNode as default };
