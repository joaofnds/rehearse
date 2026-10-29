import { readInFlightClaim } from "#benchmark/in-flight-claim";
import type { LaunchRecord } from "#benchmark/launch-record";

/**
 * Whether a live browser launch holds the claim a confirmation group or
 * session attempt directory carries, so the record it has not written yet is
 * still being written and the launch's own row stands for it. Any launch kind
 * can hold one, since case, replay, comparison and extension launches all
 * write groups. A launch made after the claim cannot be the process that
 * wrote it, so a later launch given a dead writer's pid holds nothing.
 */
async function heldInFlight(
	directory: string,
	launchByPid: ReadonlyMap<number, LaunchRecord>,
): Promise<boolean> {
	const claim = await readInFlightClaim(directory);
	if (claim === undefined) {
		return false;
	}

	const launch = launchByPid.get(claim.pid);
	if (launch === undefined) {
		return false;
	}

	return Date.parse(launch.launchedAt) <= Date.parse(claim.startedAt);
}

export { heldInFlight as default };
