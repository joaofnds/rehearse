import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { polledRunHistoryQuery } from "#client/run-history/run-history-polling";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import type { PipelineRow } from "#client/shell/run-in-flight";
import { runsInFlight } from "#client/shell/run-in-flight";
import { Grade } from "#client/system/components/grade";
import { LiveGlyph, STATUS_VOCABULARY } from "#client/system/components/status";
import type { StatusState } from "#client/system/components/status";
import type { MonitoredStage, RunRecordResponse } from "./run-record-query";
import { runRecordQuery } from "./run-record-query";
import { RunIdentityHeader } from "./run-identity-header";
import { SpendBand } from "./spend-band";

type HistoryRow = RunHistoryResponse["rows"][number];

/** One array for every render before the history loads, so it reads as unchanged. */
const NO_ROWS: readonly HistoryRow[] = [];

/**
 * The run the monitor shows: the newest run in flight, as the bar shows, and
 * once no run is in flight the last one it showed, so a run that ends while
 * watched stays on screen with its final readings.
 */
function useWatchedRun(rows: readonly HistoryRow[]): PipelineRow | undefined {
	const [newest] = runsInFlight(rows);
	const [watched, setWatched] = useState(newest?.run);
	if (newest !== undefined && newest.run !== watched) {
		setWatched(newest.run);
	}

	const run = newest?.run ?? watched;

	return rows.find(
		(row): row is PipelineRow => row.kind === "run" && row.run === run,
	);
}

interface NodeStatus {
	readonly state: StatusState;
	readonly words: string;
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

function StageNode({
	stage,
	number,
	row,
}: {
	readonly stage: MonitoredStage;
	readonly number: number;
	readonly row: PipelineRow;
}): React.JSX.Element {
	const status = nodeStatus(stage, row);

	return (
		<li className="flex items-stretch">
			<div
				className={`flex w-77.5 flex-col gap-2 rounded-lg border px-3.75 py-3 text-left ${status.state === "running" ? "border-deeper" : "border-border"}`}
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
			</div>
		</li>
	);
}

function TaskGraph({
	record,
	row,
}: {
	readonly record: RunRecordResponse;
	readonly row: PipelineRow;
}): React.JSX.Element {
	return (
		<section
			aria-label="Task graph"
			className="border-b border-divider bg-secondary"
		>
			<div className="overflow-x-auto px-5 pt-3 pb-3.75">
				<ol className="flex min-w-max items-stretch">
					{record.stages.map((stage, index) => (
						<StageNode
							key={stage.stage}
							stage={stage}
							number={index + 1}
							row={row}
						/>
					))}
				</ol>
			</div>
		</section>
	);
}

function RunMonitor({ row }: { readonly row: PipelineRow }): React.JSX.Element {
	const query = useQuery(runRecordQuery(row.run));

	return (
		<div className="flex flex-col">
			{query.isError ? (
				<p role="alert" className="px-6 py-4 text-muted-foreground">
					<span aria-hidden="true">⚠ </span>
					Could not read this run's stages.
				</p>
			) : null}
			{query.isSuccess ? (
				<>
					<RunIdentityHeader row={row} identity={query.data.identity} />
					{row.progress.state === "running" ? (
						<SpendBand progress={row.progress} />
					) : null}
					<TaskGraph record={query.data} row={row} />
				</>
			) : null}
		</div>
	);
}

/**
 * The live monitor (SPEC.md:132): one pipeline run, the newest in flight.
 * The design draws the monitor for a run in flight only, so the line shown
 * with none is a stand-in until the design agent draws that state.
 */
export function MonitorPage(): React.JSX.Element {
	const { data } = useQuery(polledRunHistoryQuery);
	const row = useWatchedRun(data?.rows ?? NO_ROWS);
	if (row === undefined) {
		return <p className="px-6 py-4 text-muted-foreground">No run in flight.</p>;
	}

	return <RunMonitor row={row} />;
}
