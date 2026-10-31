import type { LaunchEnding } from "#benchmark/launch-ending";
import { readLaunchEnding } from "#benchmark/launch-ending";
import { readLaunchRecord } from "#benchmark/launch-record";
import type { LaunchRecord } from "#benchmark/launch-record";
import { launchIds } from "#benchmark/run-layout";
import type { RunLiveness } from "#benchmark/run-liveness";
import { redactAbsolutePaths } from "#server/redact-path";
import type { UnreadableRecord } from "#server/run-history-contract";

interface EndedLaunch {
	readonly record: LaunchRecord;
	readonly ending: LaunchEnding;
}

/**
 * Each launch whose process is alive, each exited one the operator stopped,
 * and each exited one whose command recorded an error it ended by. A stopped
 * single pipeline case can also have a run row that reads OPERATOR_STOPPED,
 * but nothing links the two once the process is gone, and one stopped before
 * its run record exists has no other row, so every stopped launch is listed.
 * A launch that ended by an error before the operator's stop ended it is
 * listed as ended. A record that does not read is reported beside the rows,
 * like any other.
 */
async function liveLaunches(
	runsDirectory: string,
	liveness: RunLiveness,
): Promise<{
	readonly launches: readonly LaunchRecord[];
	readonly stopped: readonly LaunchRecord[];
	readonly ended: readonly EndedLaunch[];
	readonly unreadable: readonly UnreadableRecord[];
}> {
	const launches: LaunchRecord[] = [];
	const stopped: LaunchRecord[] = [];
	const ended: EndedLaunch[] = [];
	const unreadable: UnreadableRecord[] = [];
	await Array.fromAsync(await launchIds(runsDirectory), async (id) => {
		try {
			const record = await readLaunchRecord(runsDirectory, id);
			if (liveness.isAlive(record.pid)) {
				launches.push(record);

				return;
			}
			const ending = await readLaunchEnding(runsDirectory, id);
			if (ending !== undefined && !stoppedFirst(record, ending)) {
				ended.push({ ending, record });
			} else if (record.stopRequestedAt !== undefined) {
				stopped.push(record);
			}
		} catch (error) {
			unreadable.push(
				unreadableLaunch(
					id,
					error instanceof Error ? error.message : String(error),
				),
			);
		}
	});

	return { ended, launches, stopped, unreadable };
}

function unreadableLaunch(id: string, message: string): UnreadableRecord {
	return { id, kind: "launch", reason: redactAbsolutePaths(message) };
}

function stoppedFirst(record: LaunchRecord, ending: LaunchEnding): boolean {
	return (
		record.stopRequestedAt !== undefined &&
		Date.parse(record.stopRequestedAt) <= Date.parse(ending.endedAt)
	);
}

export { liveLaunches as default };
export type { EndedLaunch };
