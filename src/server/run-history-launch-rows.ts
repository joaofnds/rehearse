import type { LaunchRecord } from "#benchmark/launch-record";
import { OPERATOR_STOPPED } from "#benchmark/stopped-status";
import type { LaunchRow, RunListingRow } from "#server/run-history-contract";

const SINGLE_ANALYSIS_ATTEMPT_COUNT = 1;

function launchRow(
	record: LaunchRecord,
	status: LaunchRow["status"],
): LaunchRow {
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
		status,
		target: record.kind,
	};
}

/**
 * The live launches no RUNNING run's row already stands for, and the
 * stopped ones, newest first.
 */
function unheldLaunchRows(
	launches: readonly LaunchRecord[],
	stopped: readonly LaunchRecord[],
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
			.map((record) => launchRow(record, "RUNNING")),
		...stopped.map((record) => launchRow(record, OPERATOR_STOPPED)),
	].toSorted((left, right) => right.launchedAt.localeCompare(left.launchedAt));
}

export { unheldLaunchRows as default };
