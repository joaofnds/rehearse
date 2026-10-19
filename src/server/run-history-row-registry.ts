import { readAllShortIds } from "#benchmark/short-id";
import type { ShortIdEntry } from "#benchmark/short-id";
import { redactAbsolutePaths } from "#server/redact-path";
import type {
	ConfirmationGroupRow,
	UnreadableRecord,
} from "#server/run-history-contract";

function replayedCheckpoints(
	entries: readonly ShortIdEntry[],
): ReadonlyMap<string, NonNullable<ConfirmationGroupRow["checkpoint"]>> {
	const checkpoints = new Map<
		string,
		NonNullable<ConfirmationGroupRow["checkpoint"]>
	>();
	for (const { record } of entries) {
		if (record.kind === "group" && record.source !== undefined) {
			checkpoints.set(record.groupId, record.source);
		}
	}

	return checkpoints;
}

/**
 * The registry names rows and nothing else, so a registry that cannot be read
 * leaves its rows listed under their Record IDs and is reported beside them.
 */
async function registryEntries(runsDirectory: string): Promise<{
	readonly entries: readonly ShortIdEntry[];
	readonly unreadable: readonly UnreadableRecord[];
}> {
	const { entries, unreadable } = await readAllShortIds(runsDirectory);

	return {
		entries,
		unreadable: unreadable.map(({ registry, reason }) => ({
			id: registry,
			kind: "short-ids",
			reason: redactAbsolutePaths(reason),
		})),
	};
}

export { replayedCheckpoints, registryEntries };
