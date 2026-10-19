import { openRunEventStore } from "#benchmark/run-events";
import {
	benchmarkRunPaths,
	recordedRunNames,
	runEventsDatabaseFile,
} from "#benchmark/run-layout";
import { requestPause } from "#benchmark/run-pause";
import {
	HTTP_STATUS_CONFLICT,
	HTTP_STATUS_NOT_FOUND,
} from "#server/http-status";
import { LaunchRefusalError } from "#server/launch-refusal";
import type { LaunchDependencies } from "#server/launches-contract";
import { redactAbsolutePaths } from "#server/redact-path";
import { IncompleteRunRecordError, runStatus } from "#server/run-status";

/**
 * Asks a recorded pipeline run to pause after its current stage, refusing one
 * whose history row does not read RUNNING, or whose records stop short of one:
 * a finished run has no next stage to hold back, and a request left beside it
 * would pause nothing.
 */
async function pauseRun(
	run: string,
	dependencies: LaunchDependencies,
): Promise<void> {
	const runs = await recordedRunNames(dependencies.runsDirectory);
	if (!runs.includes(run)) {
		throw new LaunchRefusalError(
			`No recorded run ${run}`,
			HTTP_STATUS_NOT_FOUND,
		);
	}

	const runEvents = await openRunEventStore(
		runEventsDatabaseFile(dependencies.runsDirectory),
	);
	const readRunningStatus = async (): ReturnType<typeof runStatus> => {
		try {
			return await runStatus(
				{ run, runsDirectory: dependencies.runsDirectory },
				runEvents,
				dependencies.liveness,
			);
		} catch (error) {
			if (!(error instanceof IncompleteRunRecordError)) {
				throw error;
			}

			throw new LaunchRefusalError(
				`Run ${run} is not running: ${redactAbsolutePaths(error.message)}`,
				HTTP_STATUS_CONFLICT,
			);
		} finally {
			runEvents.close();
		}
	};

	const status = await readRunningStatus();
	if (status !== "RUNNING") {
		throw new LaunchRefusalError(
			`Run ${run} is not running`,
			HTTP_STATUS_CONFLICT,
		);
	}

	await requestPause(
		benchmarkRunPaths(dependencies.runsDirectory, run),
		new Date().toISOString(),
	);
}

export { pauseRun as default };
