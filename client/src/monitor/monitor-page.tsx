import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { polledRunHistoryQuery } from "#client/run-history/run-history-polling";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import type { PipelineRow } from "#client/shell/run-in-flight";
import { runsInFlight } from "#client/shell/run-in-flight";
import type { RunRecordResponse } from "./run-record-query";
import { runRecordQuery } from "./run-record-query";
import { useRunEventsStream } from "./run-events-stream";
import { RunIdentityHeader } from "./run-identity-header";
import { SpendBand } from "./spend-band";
import { StagePanes } from "./stage-panes";
import { TaskGraph } from "./task-graph";

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

/**
 * The stage the panes follow: the one the operator selected, or with none
 * selected the running one.
 */
function shownStage(
	record: RunRecordResponse,
	row: PipelineRow,
	selected: string | undefined,
): { readonly number: number; readonly stage: string } | undefined {
	const running =
		row.progress.state === "running" ? row.progress.stage : undefined;
	const index = record.stages.findIndex(
		(stage) => stage.stage === (selected ?? running),
	);

	return index === -1
		? undefined
		: { number: index + 1, stage: record.stages[index]?.stage ?? "" };
}

function RunMonitor({ row }: { readonly row: PipelineRow }): React.JSX.Element {
	const query = useQuery(runRecordQuery(row.run));
	const [selected, setSelected] = useState<string>();
	useRunEventsStream(row.run, row.progress.state === "running");
	const shown =
		query.data === undefined
			? undefined
			: shownStage(query.data, row, selected);

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
					<TaskGraph
						record={query.data}
						row={row}
						shown={selected}
						onSelect={setSelected}
					/>
					{shown === undefined ? null : (
						<StagePanes number={shown.number} stage={shown.stage} />
					)}
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
