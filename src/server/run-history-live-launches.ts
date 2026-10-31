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
 * A stop wins over an ending: the server records a stop only while the
 * process is alive, so the ending it caused is the stop's, and comparing the
 * server's clock with the command's would decide it by clock skew. A record
 * that does not read is reported beside the rows, like any other.
 */
type ListedLaunch =
	| { readonly kind: "alive" | "stopped"; readonly record: LaunchRecord }
	| { readonly kind: "ended"; readonly launch: EndedLaunch }
	| { readonly kind: "unreadable"; readonly unreadable: UnreadableRecord }
	| { readonly kind: "gone" };

async function liveLaunches(
	runsDirectory: string,
	liveness: RunLiveness,
): Promise<{
	readonly launches: readonly LaunchRecord[];
	readonly stopped: readonly LaunchRecord[];
	readonly ended: readonly EndedLaunch[];
	readonly unreadable: readonly UnreadableRecord[];
}> {
	const ids = await launchIds(runsDirectory);
	const listed = await Promise.all(
		ids.map(async (id) => await listedLaunch(runsDirectory, id, liveness)),
	);

	return {
		ended: listed.flatMap((entry) =>
			entry.kind === "ended" ? [entry.launch] : [],
		),
		launches: listed.flatMap((entry) =>
			entry.kind === "alive" ? [entry.record] : [],
		),
		stopped: listed.flatMap((entry) =>
			entry.kind === "stopped" ? [entry.record] : [],
		),
		unreadable: listed.flatMap((entry) =>
			entry.kind === "unreadable" ? [entry.unreadable] : [],
		),
	};
}

async function listedLaunch(
	runsDirectory: string,
	id: string,
	liveness: RunLiveness,
): Promise<ListedLaunch> {
	try {
		const record = await readLaunchRecord(runsDirectory, id);
		if (liveness.isAlive(record.pid)) {
			return { kind: "alive", record };
		}

		if (record.stopRequestedAt !== undefined) {
			return { kind: "stopped", record };
		}

		const ending = await readLaunchEnding(runsDirectory, id);

		return ending === undefined
			? { kind: "gone" }
			: { kind: "ended", launch: { ending, record } };
	} catch (error) {
		return {
			kind: "unreadable",
			unreadable: unreadableLaunch(
				id,
				error instanceof Error ? error.message : String(error),
			),
		};
	}
}

function unreadableLaunch(id: string, message: string): UnreadableRecord {
	return { id, kind: "launch", reason: redactAbsolutePaths(message) };
}

export { liveLaunches as default };
export type { EndedLaunch };
