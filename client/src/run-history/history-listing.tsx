import Disclosure from "#client/system/components/disclosure";

import type { ArmChoice, ChosenArm } from "./history-comparison-choice";
import { ComparisonBar } from "./history-comparison-choice";
import { EndedLaunches, LaunchQueue } from "./history-launch-records";
import HistoryListingStatus from "./history-listing-status";
import HistoryTable from "./history-records-table";
import { EMPTY_COLLECTION_LENGTH } from "./history-table-contract";
import type { HistoryView } from "./use-history-view";

interface HistoryListingProps {
	readonly view: HistoryView;
	readonly choice: ArmChoice;
	readonly chosen: readonly ChosenArm[];
	readonly clearChoice: () => void;
}

function HistoryListing({
	view,
	choice,
	chosen,
	clearChoice,
}: HistoryListingProps): React.JSX.Element {
	return (
		<div className="flex flex-col gap-5 page-gutter pt-6 pb-12">
			<HistoryListingStatus view={view} />
			<HistoryRecords
				view={view}
				choice={choice}
				chosen={chosen}
				clearChoice={clearChoice}
			/>
			<Disclosure
				collapsedLabel="How filters and counts work"
				expandedLabel="Hide filter definitions"
			>
				<p className="max-w-prose text-14 text-muted-foreground">
					Counts include readable run records and browser launch records. Launch
					history stays accessible separately. Ended means execution ended;
					Stopped means a workflow stopped at a step. Passed and Failed require
					a recorded quality outcome. Current corpus requires a measured
					unchanged corpus. Stale records retain their recorded grades after the
					corpus changes. Date sorting keeps unknown dates after timed records.
				</p>
			</Disclosure>
		</div>
	);
}

function HistoryRecords({
	view,
	choice,
	chosen,
	clearChoice,
}: HistoryListingProps): React.JSX.Element {
	const { rows, launches, activeLaunches, endedLaunches, nowMs } = view;
	return (
		<>
			<LaunchQueue launches={activeLaunches} nowMs={nowMs} />
			{rows.length === EMPTY_COLLECTION_LENGTH &&
			launches.length > EMPTY_COLLECTION_LENGTH ? (
				<p className="text-14 text-muted-foreground">
					No saved run records in this selection.
				</p>
			) : null}
			{rows.length > EMPTY_COLLECTION_LENGTH ? (
				<>
					<ComparisonBar chosen={chosen} onClear={clearChoice} />
					<HistoryTable rows={rows} nowMs={nowMs} choice={choice} />
				</>
			) : null}
			<EndedLaunches launches={endedLaunches} nowMs={nowMs} />
		</>
	);
}

export { HistoryListing as default };
