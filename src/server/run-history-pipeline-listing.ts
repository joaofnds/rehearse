import { recordedRunNames } from "#benchmark/run-layout";
import { formatRecordId } from "#cli/record-id";
import type {
	ListingEnvironment,
	ListingIndexes,
	RowRead,
} from "#server/run-history-listing-contract";
import listingSelection from "#server/run-history-listing-contract";
import rowFor from "#server/run-history-row-for";

async function pipelineListing(
	environment: ListingEnvironment,
	indexes: ListingIndexes,
): Promise<readonly RowRead[]> {
	const { runsDirectory, runEvents, liveness, only } = environment;
	const runs = new Set([
		...(await recordedRunNames(runsDirectory)),
		...runEvents.runIds(),
	]);

	return listingSelection([...runs], {
		idOf: (run) => formatRecordId({ kind: "run", run }),
		kind: "run",
		only,
		read: async (run, shortId) =>
			await rowFor(
				{ run, runsDirectory, shortId },
				{ launchByPid: indexes.launchByPid, liveness, runEvents },
			),
		shortIds: indexes.shortIds,
	});
}

export { pipelineListing as default };
