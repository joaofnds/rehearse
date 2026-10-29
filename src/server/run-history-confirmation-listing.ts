import { confirmationGroupIds } from "#benchmark/run-layout";
import { formatRecordId } from "#cli/record-id";
import { groupRow } from "#server/run-history-group-row";
import type {
	ListingEnvironment,
	ListingIndexes,
	RowRead,
} from "#server/run-history-listing-contract";
import listingSelection from "#server/run-history-listing-contract";

async function confirmationListing(
	{ runsDirectory, only }: ListingEnvironment,
	{ shortIds, attempts, groupCheckpoints, launchByPid }: ListingIndexes,
): Promise<readonly RowRead[]> {
	return listingSelection(await confirmationGroupIds(runsDirectory), {
		idOf: (groupId) => formatRecordId({ groupId, kind: "group" }),
		kind: "group",
		only,
		read: async (groupId, shortId) =>
			await groupRow(
				runsDirectory,
				{ checkpoint: groupCheckpoints.get(groupId), groupId, shortId },
				{ attempts, launchByPid },
			),
		shortIds,
	});
}

export { confirmationListing as default };
