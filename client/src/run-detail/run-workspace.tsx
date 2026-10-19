import type {
	MonitoredStage,
	RunRecordResponse,
} from "#client/monitor/run-record-query";
import SpendBand from "#client/monitor/spend-band";
import { TaskGraph } from "#client/monitor/task-graph";
import Switcher from "#client/system/components/switcher";

import type { AnalysisReadingResponse } from "./analysis-query";
import RunDetailHeader from "./run-detail-header";
import type { RunDetailSearch, RunWorkspaceView } from "./run-detail-search";
import { RUN_WORKSPACE_VIEWS, VIEW_LABELS } from "./run-detail-search";
import type { PipelineRow } from "./run-record-readings";
import { RunEvents, RunWorkspaceViews } from "./run-workspace-views";
import type { RunWorkspaceSelection } from "./use-run-workspace-selection";
import useRunWorkspaceSelection from "./use-run-workspace-selection";

interface RunWorkspaceProps {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
	readonly search: RunDetailSearch;
	readonly analysis: AnalysisReadingResponse | "unreadable" | undefined;
	readonly analysisInFlight: boolean;
}

function RunWorkspace({
	row,
	record,
	search,
	analysis,
	analysisInFlight,
}: RunWorkspaceProps): React.JSX.Element {
	const { view, selected, choose, number } = useRunWorkspaceSelection(
		row,
		record,
		search,
	);

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
			<RunWorkspaceNavigation
				row={row}
				record={record}
				view={view}
				selected={selected}
				choose={choose}
			/>
			<RunWorkspaceViews
				row={row}
				record={record}
				search={search}
				analysis={analysis}
				analysisInFlight={analysisInFlight}
				selected={selected}
				number={number}
				view={view}
			/>
		</section>
	);
}

interface RunViewSwitcherProps {
	readonly view: RunWorkspaceView;
	readonly choose: RunWorkspaceSelection["choose"];
	readonly selected: MonitoredStage | undefined;
}

function RunViewSwitcher({
	view,
	choose,
	selected,
}: RunViewSwitcherProps): React.JSX.Element {
	return (
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
	);
}

interface RunWorkspaceNavigationProps extends RunViewSwitcherProps {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
}

function RunWorkspaceNavigation({
	row,
	record,
	view,
	selected,
	choose,
}: RunWorkspaceNavigationProps): React.JSX.Element {
	return (
		<>
			<RunViewSwitcher view={view} choose={choose} selected={selected} />
			<TaskGraph
				record={record}
				compact={view !== "activity"}
				row={row}
				shown={selected?.stage}
				onSelect={(step) => {
					choose(view, step);
				}}
			/>
		</>
	);
}

export { RunWorkspace as default };
export type { RunWorkspaceProps };
