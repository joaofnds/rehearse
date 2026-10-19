import { useQuery } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";

import { runListingQuery } from "#client/run-history/run-history-query";
import EmptyState from "#client/system/components/empty-state";
import ScreenHeader from "#client/system/components/screen-header";

/**
 * The legacy run-detail address, which names no run: it opens the newest
 * recorded pipeline run, the listing's first, under that run's own address so
 * the page can be shared and reloaded.
 */
function NewestRunDetail(): React.JSX.Element {
	const listing = useQuery(runListingQuery);
	if (listing.data === undefined) {
		return (
			<div>
				<ScreenHeader
					title="Runs"
					subline={
						listing.error === null
							? "Reading run history"
							: listing.error.message
					}
				/>
			</div>
		);
	}

	const newest = listing.data.rows.find((row) => row.kind === "run");
	if (newest === undefined) {
		return (
			<div>
				<ScreenHeader title="Runs" subline="No run recorded" />
				<EmptyState heading="No run to open">
					<p>No run is recorded yet, so there is no run detail to open.</p>
				</EmptyState>
			</div>
		);
	}

	return <Navigate to="/runs/$run" params={{ run: newest.run }} replace />;
}

export { NewestRunDetail as default };
