import { benchmarkRunPaths } from "#benchmark/run-layout";
import type { RunLocation } from "#benchmark/run-layout";
import { claimingRun, targetMarker } from "#benchmark/run-liveness";
import claimHolder from "#server/run-history-claim-holder";
import type { RunRowLiveness } from "#server/run-history-contract";

/**
 * The live browser launch whose process holds a RUNNING run's target, so the
 * launch is listed once, as the run's own row, and a stop of the run names it.
 * Only a case launch runs a pipeline, and a launch made after the claim cannot
 * be the process that wrote it, so a later launch that reuses the claiming
 * process's pid never receives the run's Stop. A launch is live by its pid
 * alone, so the run's own launch still gets it after its process dies and
 * another process takes the pid, and the stop route then refuses it because
 * that process started at another time.
 */
async function heldBy(
	{ runsDirectory, run }: RunLocation,
	{ runEvents, liveness, launchByPid }: RunRowLiveness,
): Promise<string | undefined> {
	const marker = await targetMarker(
		benchmarkRunPaths(runsDirectory, run).manifestFile,
		liveness,
		claimingRun(runEvents, run),
	);
	if (marker === undefined) {
		return undefined;
	}

	const launch = claimHolder(marker, launchByPid);

	return launch?.kind === "case" ? launch.id : undefined;
}

export { heldBy as default };
