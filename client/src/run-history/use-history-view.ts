import {
	listedRecords,
	saysNothingListed,
	waitsForCorpusFilter,
} from "./history-listing-selection";
import type { HistoryRow, LaunchRow } from "./history-table-contract";
import { NO_LISTED_ENTRIES, pipelineRuns } from "./history-table-contract";
import type { InvalidatedSelection } from "./invalidated-selection";
import { readOf, useInvalidatedSelection } from "./invalidated-view";
import type { RunDiscoverySearch } from "./run-discovery";
import type { RunHistoryResponse } from "./run-history-query";
import { listedEntryCount } from "./run-history-query";
import useNow from "./use-now";
import useRunHistory from "./use-run-history";

interface HistoryViewRequest {
	readonly invalidatedBy: string | undefined;
	readonly discovery: RunDiscoverySearch;
}

function useHistoryView({
	invalidatedBy,
	discovery,
}: HistoryViewRequest): HistoryView {
	const query = useRunHistory();
	const selection = useInvalidatedSelection(invalidatedBy, readOf(query));
	const selected = selectedHistory({ discovery, query, selection });
	const nowMs = useNow(
		pipelineRuns(selected.recorded).some(
			(row) => row.progress.state === "running",
		),
	);
	return { ...selected, nowMs, query, selection };
}

interface SelectedHistoryRequest {
	readonly query: ReturnType<typeof useRunHistory>;
	readonly selection: InvalidatedSelection | undefined;
	readonly discovery: RunDiscoverySearch;
}

function selectedHistory({
	query,
	selection,
	discovery,
}: SelectedHistoryRequest): SelectedHistoryView {
	const unreadable = query.data?.unreadable ?? [];
	const recorded = query.data?.rows ?? [];
	const allLaunches = query.data?.launches ?? [];
	const history = { launches: allLaunches, rows: recorded };
	const { rows, launches } = listedRecords(selection, history, discovery);
	const activeLaunches = launches.filter(
		(launch) => launch.status === "RUNNING",
	);
	const endedLaunches = launches.filter(
		(launch) => launch.status !== "RUNNING",
	);
	const listable = listedEntryCount(history) > NO_LISTED_ENTRIES;
	const waitingForFilter = waitsForCorpusFilter(
		query.freshnessPending,
		discovery.corpus,
	);
	return {
		activeLaunches,
		allLaunches,
		endedLaunches,
		history,
		launches,
		listable,
		nothingListed:
			query.isSuccess &&
			!waitingForFilter &&
			saysNothingListed(selection, { launches, rows }),
		recorded,
		rows,
		unreadable,
		waitingForFilter,
	};
}

interface SelectedHistoryView {
	readonly unreadable: RunHistoryResponse["unreadable"];
	readonly recorded: readonly HistoryRow[];
	readonly allLaunches: readonly LaunchRow[];
	readonly history: Pick<RunHistoryResponse, "rows" | "launches">;
	readonly rows: readonly HistoryRow[];
	readonly launches: readonly LaunchRow[];
	readonly activeLaunches: readonly LaunchRow[];
	readonly endedLaunches: readonly LaunchRow[];
	readonly listable: boolean;
	readonly waitingForFilter: boolean;
	readonly nothingListed: boolean;
}

interface HistoryView extends SelectedHistoryView {
	readonly nowMs: number;
	readonly query: ReturnType<typeof useRunHistory>;
	readonly selection: InvalidatedSelection | undefined;
}

export { useHistoryView as default };
export type { HistoryView, HistoryViewRequest };
