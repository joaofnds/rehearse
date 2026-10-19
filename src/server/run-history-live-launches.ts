import { readLaunchRecord } from "#benchmark/launch-record";
import type { LaunchRecord } from "#benchmark/launch-record";
import { launchIds } from "#benchmark/run-layout";
import type { RunLiveness } from "#benchmark/run-liveness";
import { redactAbsolutePaths } from "#server/redact-path";
import type { UnreadableRecord } from "#server/run-history-contract";

/**
 * Each launch whose process is alive, and each exited one the operator
 * stopped. A stopped single pipeline case can also have a run row that
 * reads OPERATOR_STOPPED, but nothing links the two once the process is
 * gone, and one stopped before its run record exists has no other row, so
 * every stopped launch is listed. A record that does not read is reported
 * beside the rows, like any other.
 */
async function liveLaunches(
	runsDirectory: string,
	liveness: RunLiveness,
): Promise<{
	readonly launches: readonly LaunchRecord[];
	readonly stopped: readonly LaunchRecord[];
	readonly unreadable: readonly UnreadableRecord[];
}> {
	const launches: LaunchRecord[] = [];
	const stopped: LaunchRecord[] = [];
	const unreadable: UnreadableRecord[] = [];
	await Array.fromAsync(await launchIds(runsDirectory), async (id) => {
		try {
			const record = await readLaunchRecord(runsDirectory, id);
			if (liveness.isAlive(record.pid)) {
				launches.push(record);
			} else if (record.stopRequestedAt !== undefined) {
				stopped.push(record);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			unreadable.push({
				id,
				kind: "launch",
				reason: redactAbsolutePaths(message),
			});
		}
	});

	return { launches, stopped, unreadable };
}

export { liveLaunches as default };
