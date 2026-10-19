import concurrentMap from "#benchmark/concurrent-map";
import { newestFirst } from "#benchmark/recorded-time";
import { redactAbsolutePaths } from "#server/redact-path";
import type { RunListing } from "#server/run-history-contract";
import { IncompleteConfirmationError } from "#server/run-history-group-row";
import unheldLaunchRows from "#server/run-history-launch-rows";
import type {
	ListingIndexes,
	RowRead,
} from "#server/run-history-listing-contract";
import recordedTime from "#server/run-history-recorded-time";

async function listingResult(
	reads: readonly RowRead[],
	indexes: ListingIndexes,
): Promise<RunListing> {
	const readings = await concurrentMap(reads, async ({ kind, id, read }) => {
		try {
			return { row: await read() };
		} catch (error) {
			const failed = {
				id,
				kind,
				reason: redactAbsolutePaths(
					error instanceof Error ? error.message : String(error),
				),
			};

			return {
				unreadable:
					error instanceof IncompleteConfirmationError
						? { ...failed, incompleteConfirmation: { groupId: error.groupId } }
						: failed,
			};
		}
	});
	const rows = readings.flatMap(({ row }) => (row === undefined ? [] : [row]));
	const unreadable = readings.flatMap((reading) =>
		reading.unreadable === undefined ? [] : [reading.unreadable],
	);

	return {
		launches: unheldLaunchRows(
			indexes.live.launches,
			indexes.live.stopped,
			rows,
		),
		rows: newestFirst(rows, recordedTime),
		unreadable: [
			...indexes.unreadable,
			...unreadable,
			...indexes.live.unreadable,
		],
	};
}

export { listingResult as default };
