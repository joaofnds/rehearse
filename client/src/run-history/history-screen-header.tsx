import { LaunchDialog } from "#client/launch/launch-dialog";
import plural from "#client/plural";
import ScreenHeader from "#client/system/components/screen-header";

import { ReplayAStep } from "./history-empty-states";
import { replayOffer } from "./replay-choices";
import { listedEntryCount } from "./run-history-query";
import type { HistoryView } from "./use-history-view";

interface HistoryHeaderProps {
	readonly query: HistoryView["query"];
	readonly history: HistoryView["history"];
	readonly recorded: HistoryView["recorded"];
	readonly allLaunches: HistoryView["allLaunches"];
}

function HistoryHeader({
	query,
	history,
	recorded,
	allLaunches,
}: HistoryHeaderProps): React.JSX.Element {
	return (
		<ScreenHeader
			title="Runs"
			subline={
				query.isSuccess
					? `${plural(listedEntryCount(history), "readable entry", "readable entries")} · ${plural(recorded.length, "record")} · ${plural(allLaunches.length, "launch", "launches")}`
					: undefined
			}
			aside={
				<span className="flex flex-wrap items-center justify-end gap-2">
					<ReplayAStep
						offer={query.data === undefined ? undefined : replayOffer(recorded)}
					/>
					<LaunchDialog
						target={{ kind: "case" }}
						triggerLabel="New run"
						shortcut="n"
					/>
				</span>
			}
		/>
	);
}

export { HistoryHeader as default };
