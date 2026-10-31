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
	// The diagnose command records a stop, but the browser offers none for an
	// analysis, so its launch row shows no Stop either.
	if (record.kind === "analysis") {
		throw new LaunchRefusalError(
			`Launch ${id} is a root-cause analysis, one call capped at the cost it stated; stopping it from the browser is not offered`,
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
