import HistoryWorkspaceReadings from "./history-investigation";
import type { SessionHistoryIdentity } from "./history-investigation-contract";
import HistoryHeader from "./history-record-provenance";
import { summaryPath } from "./history-report-query";
import useHistoryReads from "./use-history-evidence";
import { useInvestigationSelection } from "./use-investigation-selection";
import useSelectedEvidence from "./use-selected-history-evidence";

interface SessionHistoryPageProps {
	readonly identity: SessionHistoryIdentity;
	readonly embedded?: boolean;
	readonly initialEventId?: string | undefined;
	readonly revealEvents?: boolean;
}

function SessionHistoryPage(props: SessionHistoryPageProps): React.JSX.Element {
	return (
		<SessionHistoryWorkspace
			key={`${summaryPath(props.identity)}:${props.initialEventId ?? "selection"}`}
			{...props}
		/>
	);
}

function SessionHistoryWorkspace({
	identity,
	embedded = false,
	initialEventId,
	revealEvents = false,
}: SessionHistoryPageProps): React.JSX.Element {
	const path = summaryPath(identity);
	const controls = useInvestigationSelection(path, initialEventId);

	const reads = useHistoryReads(identity, path);
	const evidence = useSelectedEvidence({ controls, identity, path, reads });

	return (
		<div className="flex min-h-full flex-col">
			<HistoryHeader
				embedded={embedded}
				identity={identity}
				data={reads.summary.data}
				names={reads.names}
			/>
			<HistoryWorkspaceReadings
				identity={identity}
				path={path}
				reads={reads}
				controls={controls}
				evidence={evidence}
				revealEvents={revealEvents}
			/>
		</div>
	);
}

export type { SessionHistoryIdentity } from "./history-investigation-contract";
export { sessionHistoryQuery } from "./history-report-query";
export {
	eventForRequestRow,
	requestRowsOwningEvents,
} from "./history-request-timeline";
export { SessionHistoryPage };
