import { openRunEventStore } from "#benchmark/run-events";
import {
	benchmarkRunPaths,
	recordedRunNames,
	runEventsDatabaseFile,
} from "#benchmark/run-layout";
import { claimingRun, targetMarker } from "#benchmark/run-liveness";
import {
	HTTP_STATUS_CONFLICT,
	HTTP_STATUS_NOT_FOUND,
} from "#server/http-status";
import { LaunchRefusalError } from "#server/launch-refusal";
import type { LaunchDependencies } from "#server/launches-contract";

/**
 * The pid holding a recorded run's own claim on its target, for a run started
 * outside the browser, which has no launch to stop it through. The claim is
 * written by the run's process after it starts, so a process that started
 * later holds a reused pid and is refused. `ps` reports the start to the
 * second, so the run's own process never reads as later than its claim.
 */
async function claimingProcess(
	run: string,
	dependencies: LaunchDependencies,
): Promise<number> {
	const runs = await recordedRunNames(dependencies.runsDirectory);
	if (!runs.includes(run)) {
		throw new LaunchRefusalError(
			`No recorded run ${run}`,
			HTTP_STATUS_NOT_FOUND,
		);
	}

	const marker = await readRunTargetMarker(run, dependencies);
	if (marker === undefined || !dependencies.liveness.isAlive(marker.pid)) {
		throw new LaunchRefusalError(
			`Run ${run} is not running`,
			HTTP_STATUS_CONFLICT,
		);
	}

	const started = await dependencies.launcher.startedAt(marker.pid);
	if (
		started === undefined ||
		Date.parse(`${started} UTC`) > Date.parse(marker.startedAt)
	) {
		throw new LaunchRefusalError(
			`Run ${run} is not running`,
			HTTP_STATUS_CONFLICT,
		);
	}

	return marker.pid;
}

async function readRunTargetMarker(
	run: string,
	dependencies: LaunchDependencies,
): ReturnType<typeof targetMarker> {
	const runEvents = await openRunEventStore(
		runEventsDatabaseFile(dependencies.runsDirectory),
	);
	try {
		return await targetMarker(
			benchmarkRunPaths(dependencies.runsDirectory, run).manifestFile,
			dependencies.liveness,
			claimingRun(runEvents, run),
		);
	} finally {
		runEvents.close();
	}
}

export { claimingProcess as default };
