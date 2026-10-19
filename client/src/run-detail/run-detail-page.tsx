import EmptyState from "#client/system/components/empty-state";

import type { RunDetailSearch } from "./run-detail-search";
import type { HistoryRow, PipelineRow } from "./run-record-readings";
import RunWorkspace from "./run-workspace";
import type { RunDetailReads } from "./use-run-detail-reads";
import useRunDetailReads from "./use-run-detail-reads";

/**
 * A pipeline run keeps one identity while its evidence is read in three views.
 */
interface RunDetailPageProps {
	readonly run: string;
	readonly search: RunDetailSearch;
}

function RunDetailPage({
	run,
	search,
}: RunDetailPageProps): React.JSX.Element | null {
	const reading = useRunDetailReads(run);
	if (reading.history.isError && reading.history.data === undefined) {
		return <UnreadableRun run={run} />;
	}

	if (reading.history.data === undefined) {
		return null;
	}

	return (
		<ListedRunRecord
			run={run}
			search={search}
			reading={reading}
			rows={reading.history.data.rows}
		/>
	);
}

interface ListedRunRecordProps extends RunDetailPageProps {
	readonly reading: RunDetailReads;
	readonly rows: readonly HistoryRow[];
}

function ListedRunRecord({
	run,
	search,
	reading,
	rows: listedRows,
}: ListedRunRecordProps): React.JSX.Element | null {
	const { record, analyses, analysisInFlight } = reading;

	const rows = listedRows.filter(
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
		return <UnreadableRun run={run} />;
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

interface UnreadableRunProps {
	readonly run: string;
}

function UnreadableRun({ run }: UnreadableRunProps): React.JSX.Element {
	return (
		<p role="alert" className="page-gutter py-4 text-attention">
			<span aria-hidden="true">⚠ </span>
			Could not read run {run}.
		</p>
	);
}

export { RunDetailPage as default };
