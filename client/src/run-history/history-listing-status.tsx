import plural from "#client/plural";

import { LoadState, NothingListed } from "./history-empty-states";
import { EMPTY_COLLECTION_LENGTH } from "./history-table-contract";
import { InvalidatedNotice } from "./invalidated-view";
import RecordIssues from "./record-issues";
import { listedEntryCount } from "./run-history-query";
import type { HistoryView } from "./use-history-view";

interface HistoryListingStatusProps {
	readonly view: HistoryView;
}

function HistoryListingStatus({
	view,
}: HistoryListingStatusProps): React.JSX.Element {
	const {
		query,
		selection,
		unreadable,
		listable,
		waitingForFilter,
		nothingListed,
	} = view;
	return (
		<>
			<LoadState
				loading={query.isLoading || waitingForFilter}
				failed={query.isError}
			/>
			{query.data === undefined ? null : <HistoryCount view={view} />}
			{selection === undefined ? null : (
				<InvalidatedNotice selection={selection} />
			)}
			{query.data === undefined ? null : <RecordIssues records={unreadable} />}
			{nothingListed ? (
				<NothingListed
					listable={listable}
					unreadable={unreadable.length > EMPTY_COLLECTION_LENGTH}
				/>
			) : null}
		</>
	);
}

function HistoryCount({ view }: HistoryListingStatusProps): React.JSX.Element {
	const { history, rows, launches, activeLaunches, endedLaunches } = view;
	return (
		<p
			role="status"
			className="text-12 text-muted-foreground"
		>{`${String(listedEntryCount({ launches, rows }))} of ${String(listedEntryCount(history))} readable entries match · ${plural(rows.length, "record")} · ${plural(activeLaunches.length, "active launch", "active launches")} · ${plural(endedLaunches.length, "ended launch", "ended launches")}`}</p>
	);
}

export { HistoryListingStatus as default };
