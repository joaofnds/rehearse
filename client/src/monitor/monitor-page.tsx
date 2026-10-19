import { useQuery } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";

import plural from "#client/plural";
import { polledRunListingQuery } from "#client/run-history/run-history-polling";
import { runsInFlight } from "#client/shell/run-in-flight";
import EmptyState from "#client/system/components/empty-state";
import ScreenHeader from "#client/system/components/screen-header";

/** The legacy monitor entry opens the newest live run in its workspace. */
function MonitorPage(): React.JSX.Element | null {
	const { data, isError } = useQuery(polledRunListingQuery);
	if (isError) {
		return (
			<p role="alert" className="px-6 py-4 text-attention">
				<span aria-hidden="true">⚠ </span>
				Could not read the runs in flight.
			</p>
		);
	}
	if (data === undefined) {
		return null;
	}

	const inFlight = runsInFlight(data.rows);
	const [shown] = inFlight;
	if (shown === undefined) {
		return (
			<div>
				<ScreenHeader
					title="Activity"
					subline={`${plural(inFlight.length, "run")} in flight`}
				/>
				<EmptyState heading="No run in flight">
					<p>
						A pipeline run shows here while it runs, whether the browser or a
						terminal started it.
					</p>
				</EmptyState>
			</div>
		);
	}

	return (
		<Navigate
			to="/runs/$run"
			params={{ run: shown.run }}
			search={{ view: "activity" }}
			replace
		/>
	);
}

export { MonitorPage as default };
