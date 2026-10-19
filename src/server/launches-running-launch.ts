import { isLaunchId, readLaunchRecord } from "#benchmark/launch-record";
import type { LaunchRecord } from "#benchmark/launch-record";
import { launchPaths } from "#benchmark/run-layout";
import {
	HTTP_STATUS_CONFLICT,
	HTTP_STATUS_NOT_FOUND,
} from "#server/http-status";
import { LaunchRefusalError } from "#server/launch-refusal";
import type { LaunchDependencies } from "#server/launches-contract";

/**
 * The launch a stop names, once its process is still the one the launch
 * started: a pid alone could name a later process the system gave it to.
 */
async function runningLaunch(
	id: string,
	dependencies: LaunchDependencies,
): Promise<LaunchRecord> {
	if (
		!isLaunchId(id) ||
		!(await Bun.file(
			launchPaths(dependencies.runsDirectory, id).recordFile,
		).exists())
	) {
		throw new LaunchRefusalError(`Unknown launch ${id}`, HTTP_STATUS_NOT_FOUND);
	}

	const record = await readLaunchRecord(dependencies.runsDirectory, id);
	// The diagnose command installs no signal handling, so a stopped call could
	// spend and leave no record of it.
	if (record.kind === "analysis") {
		throw new LaunchRefusalError(
			`Launch ${id} is a root-cause analysis, one call capped at the cost it stated, which records what it spent when it ends; it cannot be stopped`,
			HTTP_STATUS_CONFLICT,
		);
	}

	if (record.startedAt === undefined) {
		throw new LaunchRefusalError(
			`Launch ${id} was recorded without its process start time, so its pid cannot be told from another process's. Stop it from a terminal.`,
			HTTP_STATUS_CONFLICT,
		);
	}

	if (
		(await dependencies.launcher.startedAt(record.pid)) !== record.startedAt
	) {
		throw new LaunchRefusalError(
			`Launch ${id} is no longer running`,
			HTTP_STATUS_CONFLICT,
		);
	}

	return record;
}

export { runningLaunch as default };
