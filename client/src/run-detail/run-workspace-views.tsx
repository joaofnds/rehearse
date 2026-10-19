import useRunEventsStream from "#client/monitor/run-events-stream";
import type { MonitoredStage } from "#client/monitor/run-record-query";
import StagePanes from "#client/monitor/stage-panes";

import RunContext from "./run-context";
import type { RunWorkspaceView } from "./run-detail-search";
import RunResults from "./run-results";
import { SelectedStepActions } from "./run-selected-step-actions";
import type { RunWorkspaceProps } from "./run-workspace";

interface RunEventsProps {
	readonly run: string;
}

function RunEvents({ run }: RunEventsProps): null {
	useRunEventsStream(run);
	return null;
}

interface RunActivityProps {
	readonly run: string;
	readonly number: number;
	readonly stage: MonitoredStage;
}

function RunActivity({
	run,
	number,
	stage,
}: RunActivityProps): React.JSX.Element {
	return (
		<div className="flex min-h-180 flex-1 basis-0 flex-col lg:min-h-70.75">
			<StagePanes run={run} number={number} stage={stage} />
		</div>
	);
}

interface RunWorkspaceViewsProps extends RunWorkspaceProps {
	readonly selected: MonitoredStage | undefined;
	readonly number: number;
	readonly view: RunWorkspaceView;
}

function RunWorkspaceViews({
	row,
	record,
	search,
	analysis,
	analysisInFlight,
	selected,
	number,
	view,
}: RunWorkspaceViewsProps): React.JSX.Element {
	return (
		<>
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
				<RunContext
					row={row}
					record={record}
					selected={selected}
					search={search}
				/>
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
		</>
	);
}

export { RunEvents, RunWorkspaceViews };
