import type { LaunchRecord } from "#benchmark/launch-record";

interface HeldClaim {
	readonly pid: number;
	readonly startedAt: string;
}

/**
 * The live browser launch whose process made a claim. A launch made after
 * the claim cannot be the process that wrote it, so a later launch given a
 * dead writer's pid holds nothing.
 */
function claimHolder(
	claim: HeldClaim,
	launchByPid: ReadonlyMap<number, LaunchRecord>,
): LaunchRecord | undefined {
	const launch = launchByPid.get(claim.pid);
	if (launch === undefined) {
		return undefined;
	}

	return Date.parse(launch.launchedAt) <= Date.parse(claim.startedAt)
		? launch
		: undefined;
}

export { claimHolder as default };
