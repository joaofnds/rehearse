import type { ArmChoice, ChosenArm } from "./history-comparison-choice";
import FilterBar from "./history-filter-bar";
import HistoryListing from "./history-listing";
import HistoryHeader from "./history-screen-header";
import type { RunDiscoverySearch } from "./run-discovery";
import { listedEntryCount } from "./run-history-query";
import type { HistoryView } from "./use-history-view";

interface HistoryScreenProps {
	readonly discovery: RunDiscoverySearch;
	readonly view: HistoryView;
	readonly choice: ArmChoice;
	readonly chosen: readonly ChosenArm[];
	readonly changeDiscovery: (search: RunDiscoverySearch) => void;
	readonly clearDiscovery: () => void;
	readonly clearChoice: () => void;
}

function HistoryScreen({
	discovery,
	view,
	choice,
	chosen,
	changeDiscovery,
	clearDiscovery,
	clearChoice,
}: HistoryScreenProps): React.JSX.Element {
	const { query, history, recorded, allLaunches, selection } = view;
	return (
		<div>
			<HistoryHeader
				query={query}
				history={history}
				recorded={recorded}
				allLaunches={allLaunches}
			/>
			<FilterBar
				discovery={discovery}
				total={
					query.data === undefined ? undefined : listedEntryCount(query.data)
				}
				onChange={changeDiscovery}
				invalidated={selection !== undefined}
				onClear={clearDiscovery}
			/>
			<HistoryListing
				view={view}
				choice={choice}
				chosen={chosen}
				clearChoice={clearChoice}
			/>
		</div>
	);
}

export { HistoryScreen as default };
