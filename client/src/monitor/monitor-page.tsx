import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { polledRunHistoryQuery } from "#client/run-history/run-history-polling";
import type { PipelineRow } from "#client/shell/run-in-flight";
import { runsInFlight } from "#client/shell/run-in-flight";
import type { RunRecordResponse } from "./run-record-query";
import { runRecordQuery } from "./run-record-query";
import { useRunEventsStream } from "./run-events-stream";
import { RunIdentityHeader } from "./run-identity-header";
import { SpendBand } from "./spend-band";
import { StagePanes } from "./stage-panes";
import { TaskGraph } from "./task-graph";

/**
 * The stage the panes follow: the one the operator selected, or with none
 * selected the running one.
 */
function shownStage(
	record: RunRecordResponse,
	row: PipelineRow,
	selected: string | undefined,
): { readonly number: number; readonly stage: string } | undefined {
	const stage =
		selected ??
		(row.progress.state === "running" ? row.progress.stage : undefined);
	const index = record.stages.findIndex((each) => each.stage === stage);

	return stage === undefined || index === -1
		? undefined
		: { number: index + 1, stage };
}

function RunMonitor({ row }: { readonly row: PipelineRow }): React.JSX.Element {
	const query = useQuery(runRecordQuery(row.run));
	const [selected, setSelected] = useState<string>();
	useRunEventsStream(row.run);
	const shown =
		query.data === undefined
			? undefined
			: shownStage(query.data, row, selected);

	return (
		<div className="flex min-h-full flex-col">
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
						shown={shown?.stage}
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
 * The live monitor (SPEC.md:132): one pipeline run in flight, the one its
 * address names or else the newest. The design draws the monitor for a run in
 * flight only, so a run that ends leaves it, and the lines shown with none, for
 * a named run not in flight, or with the runs unread, follow the design's muted
 * status lines.
 */
export function MonitorPage({
	run,
}: {
	readonly run?: string | undefined;
}): React.JSX.Element | null {
	const { data, isError } = useQuery(polledRunHistoryQuery);
	if (isError) {
		return (
			<p role="alert" className="px-6 py-4 text-muted-foreground">
				<span aria-hidden="true">⚠ </span>
				Could not read the runs in flight.
			</p>
		);
	}
	if (data === undefined) {
		return null;
	}

	const inFlight = runsInFlight(data.rows);
	const shown =
		run === undefined ? inFlight[0] : inFlight.find((row) => row.run === run);
	if (shown === undefined) {
		return (
			<p className="px-6 py-4 text-muted-foreground">
				{run === undefined
					? "No run in flight."
					: "This run is not in flight."}
			</p>
		);
	}

	return <RunMonitor key={shown.run} row={shown} />;
}
