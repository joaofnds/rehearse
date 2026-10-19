import HistoryScreen from "./history-screen";
import type { RunDiscoverySearch } from "./run-discovery";
import useComparisonChoice from "./use-comparison-choice";
import useHistoryNavigation from "./use-history-navigation";
import useHistoryView from "./use-history-view";

interface RunHistoryPageProps {
	readonly invalidatedBy: string | undefined;
	readonly discovery: RunDiscoverySearch;
}

function RunHistoryPage({
	invalidatedBy,
	discovery,
}: RunHistoryPageProps): React.JSX.Element {
	const navigation = useHistoryNavigation({ discovery, invalidatedBy });
	const { choice, chosen, clearChoice } = useComparisonChoice();
	const view = useHistoryView({ discovery, invalidatedBy });

	return (
		<HistoryScreen
			discovery={discovery}
			view={view}
			choice={choice}
			chosen={chosen}
			clearChoice={clearChoice}
			{...navigation}
		/>
	);
}

export { RunHistoryPage as default };
