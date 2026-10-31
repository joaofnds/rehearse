import { LAUNCH_ENDED } from "#benchmark/launch-ending";
import type { LaunchRecord } from "#benchmark/launch-record";
import { OPERATOR_STOPPED } from "#benchmark/stopped-status";
import { redactAbsolutePaths } from "#server/redact-path";
import type {
	LaunchRow,
	LaunchRowFields,
	ProcessLaunchRow,
	RunListingRow,
} from "#server/run-history-contract";
import type { EndedLaunch } from "#server/run-history-live-launches";

const SINGLE_ANALYSIS_ATTEMPT_COUNT = 1;

function launchFields(record: LaunchRecord): LaunchRowFields {
	return {
		attempts:
			record.kind === "analysis"
				? SINGLE_ANALYSIS_ATTEMPT_COUNT
				: record.attempts,
		caseId: record.kind === "case" ? record.caseId : undefined,
		id: record.id,
		kind: "launch",
		launchedAt: record.launchedAt,
		run: record.kind === "case" ? undefined : record.run,
		stage:
			record.kind === "case" || record.kind === "analysis"
				? undefined
				: record.stage,
		target: record.kind,
	};
}

function processRow(
	record: LaunchRecord,
	status: ProcessLaunchRow["status"],
): LaunchRow {
	return { ...launchFields(record), status };
}

function endedRow({ record, ending }: EndedLaunch): LaunchRow {
	return {
		...launchFields(record),
		ending: {
			exitCode: ending.exitCode,
			message: redactAbsolutePaths(ending.message),
		},
		status: LAUNCH_ENDED,
	};
}

interface ListedLaunches {
	readonly launches: readonly LaunchRecord[];
	readonly stopped: readonly LaunchRecord[];
	readonly ended: readonly EndedLaunch[];
}

/**
 * The live launches no RUNNING run's row already stands for, and the
 * stopped and ended ones, newest first.
 */
function unheldLaunchRows(
	{ launches, stopped, ended }: ListedLaunches,
	rows: readonly RunListingRow[],
): readonly LaunchRow[] {
	const held = new Set(
		rows.flatMap((row) =>
			row.kind === "run" && row.launchId !== undefined ? [row.launchId] : [],
		),
	);

	return [
		...launches
			.filter(({ id }) => !held.has(id))
			.map((record) => processRow(record, "RUNNING")),
		...stopped.map((record) => processRow(record, OPERATOR_STOPPED)),
		...ended.map((launch) => endedRow(launch)),
	].toSorted((left, right) => right.launchedAt.localeCompare(left.launchedAt));
}

export { unheldLaunchRows as default };
