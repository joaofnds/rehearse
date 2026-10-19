import { shortIdsOf } from "#cli/short-id-column";
import { checkpointAttempts } from "#server/checkpoint-attempts";
import type {
	ListingEnvironment,
	ListingIndexes,
} from "#server/run-history-listing-contract";
import liveLaunches from "#server/run-history-live-launches";
import {
	registryEntries,
	replayedCheckpoints,
} from "#server/run-history-row-registry";

async function listingIndexes({
	runsDirectory,
	liveness,
	only,
}: ListingEnvironment): Promise<ListingIndexes> {
	const registry = await registryEntries(runsDirectory);
	const shortIds = shortIdsOf(registry.entries);
	const groupCheckpoints = replayedCheckpoints(registry.entries);
	const attempts = await checkpointAttempts(runsDirectory, registry.entries);
	const live =
		only === undefined
			? await liveLaunches(runsDirectory, liveness)
			: { launches: [], stopped: [], unreadable: [] };
	const launchByPid = new Map(
		live.launches.map((launch) => [launch.pid, launch] as const),
	);

	return {
		attempts,
		groupCheckpoints,
		launchByPid,
		live,
		shortIds,
		unreadable: registry.unreadable,
	};
}

export { listingIndexes as default };
