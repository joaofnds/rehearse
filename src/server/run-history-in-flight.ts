import { readInFlightClaim } from "#benchmark/in-flight-claim";
import type { LaunchRecord } from "#benchmark/launch-record";
import claimHolder from "#server/run-history-claim-holder";

/**
 * Whether a live browser launch holds the claim a confirmation group or
 * session attempt directory carries, so the record it has not written yet is
 * still being written and the launch's own row stands for it. Any launch kind
 * can hold one, since case, replay, comparison and extension launches all
 * write groups.
 */
async function heldInFlight(
	directory: string,
	launchByPid: ReadonlyMap<number, LaunchRecord>,
): Promise<boolean> {
	const claim = await readInFlightClaim(directory);

	return claim !== undefined && claimHolder(claim, launchByPid) !== undefined;
}

export { heldInFlight as default };
