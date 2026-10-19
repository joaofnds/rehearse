import { HTTP_STATUS_CONFLICT } from "#server/http-status";
import { LaunchRefusalError } from "#server/launch-refusal";

/**
 * Starts an analysis of a run only while no other analysis of it is starting
 * in this server. An analysis has no launch record until its process is
 * started, so without this two requests arriving together would both pass
 * the record check and start two paid calls.
 */
async function startSoleAnalysisOf(
	run: string,
	runsStartingAnalysis: Set<string>,
	start: () => Promise<string>,
): Promise<string> {
	if (runsStartingAnalysis.has(run)) {
		throw new LaunchRefusalError(
			`An analysis of run ${run} is already starting; try again in a moment`,
			HTTP_STATUS_CONFLICT,
		);
	}

	runsStartingAnalysis.add(run);
	try {
		return await start();
	} finally {
		runsStartingAnalysis.delete(run);
	}
}

export { startSoleAnalysisOf as default };
