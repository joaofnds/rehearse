import { replayAttemptIds, sessionAttemptIds } from "#benchmark/run-layout";
import { formatRecordId } from "#cli/record-id";
import type {
	ListingEnvironment,
	ListingIndexes,
	RowRead,
} from "#server/run-history-listing-contract";
import listingSelection from "#server/run-history-listing-contract";
import { replayRow } from "#server/run-history-replay-row";
import { sessionAttemptRow } from "#server/run-history-session-attempt-row";

async function sessionListing(
	{ runsDirectory, only }: ListingEnvironment,
	{ shortIds, launchByPid }: ListingIndexes,
): Promise<readonly RowRead[]> {
	return listingSelection(await sessionAttemptIds(runsDirectory), {
		idOf: (attempt) => formatRecordId({ kind: "attempt:session", ...attempt }),
		kind: "session-attempt",
		only,
		read: async (attempt, shortId) =>
			await sessionAttemptRow({
				attempt,
				launchByPid,
				runsDirectory,
				shortId,
			}),
		shortIds,
	});
}

async function replayListing(
	{ runsDirectory, only }: ListingEnvironment,
	{ shortIds, attempts }: ListingIndexes,
): Promise<readonly RowRead[]> {
	return listingSelection(await replayAttemptIds(runsDirectory), {
		idOf: (attempt) => formatRecordId({ kind: "attempt:stage", ...attempt }),
		kind: "replay",
		only,
		read: async (attempt, shortId) =>
			await replayRow(
				{ attempt, runsDirectory, shortId },
				{ attempts, shortIds },
			),
		shortIds,
	});
}

export { sessionListing, replayListing };
