import { readConfirmationArchive } from "#benchmark/confirmation-archive";
import type { LaunchRecord } from "#benchmark/launch-record";
import { stoppedBeforeGroupRecord } from "#benchmark/operator-stop";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import heldInFlight from "#server/run-history-in-flight";

interface UnsummarizedGroup {
	readonly runsDirectory: string;
	readonly groupId: string;
	readonly launchByPid: ReadonlyMap<number, LaunchRecord>;
}

/**
 * Whether a group with no summary is left out of history rather than listed
 * among the confirmation runs with no saved summary: the operator stopped or
 * archived it, or a live launch holds its writer.
 */
async function leftOutWithoutSummary({
	runsDirectory,
	groupId,
	launchByPid,
}: UnsummarizedGroup): Promise<boolean> {
	const paths = confirmationGroupPaths(runsDirectory, groupId);
	if (await stoppedBeforeGroupRecord(paths)) {
		return true;
	}

	if (
		(await readConfirmationArchive({ groupId, runsDirectory })) !== undefined
	) {
		return true;
	}

	return await heldInFlight(paths.directory, launchByPid);
}

export { leftOutWithoutSummary as default };
