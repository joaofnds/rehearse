import { openRunEventStore } from "#benchmark/run-events";
import { runEventsDatabaseFile } from "#benchmark/run-layout";
import type { RunLiveness } from "#benchmark/run-liveness";
import type { RunListing } from "#server/run-history-contract";
import listingIndexes from "#server/run-history-listing-indexes";
import listingReads from "#server/run-history-listing-reads";
import listingResult from "#server/run-history-listing-result";

async function readRunListing(
	runsDirectory: string,
	liveness: RunLiveness,
	only?: ReadonlySet<string>,
): Promise<RunListing> {
	const runEvents = await openRunEventStore(
		runEventsDatabaseFile(runsDirectory),
	);
	try {
		const environment = { liveness, only, runEvents, runsDirectory };
		const indexes = await listingIndexes(environment);
		const reads = await listingReads(environment, indexes);

		return await listingResult(reads, indexes);
	} finally {
		runEvents.close();
	}
}

export { readRunListing as default };
