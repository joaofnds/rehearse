import { refuseUnanalyzable } from "#benchmark/root-cause-analysis";
import { recordedRunNames } from "#benchmark/run-layout";
import {
	HTTP_STATUS_CONFLICT,
	HTTP_STATUS_NOT_FOUND,
} from "#server/http-status";
import { LaunchRefusalError, asLaunchRefusal } from "#server/launch-refusal";
import type { Launch, LaunchDependencies } from "#server/launches-contract";
import {
	BROWSER_ANALYSIS_MODEL,
	browserAnalysisCapUsd,
} from "#server/root-cause-analyses";
import { liveLaunches } from "#server/run-history";

const USD_FRACTION_DIGITS = 2;

interface AnalysisLaunchRequest {
	readonly run: string;
	readonly statedUsd: number;
}

/**
 * An analysis is one paid call capped under the stored ceiling, so a run the
 * CLI would refuse is refused here, and so is a cap other than the one the
 * operator approved.
 */
async function analysisLaunch(
	request: AnalysisLaunchRequest,
	dependencies: Readonly<LaunchDependencies>,
	ceilingUsd: number,
): Promise<Launch> {
	const runs = await recordedRunNames(dependencies.runsDirectory);
	if (!runs.includes(request.run)) {
		throw new LaunchRefusalError(
			`No recorded run ${request.run}`,
			HTTP_STATUS_NOT_FOUND,
		);
	}

	await asLaunchRefusal(async () => {
		await refuseUnanalyzable(
			{ run: request.run, runsDirectory: dependencies.runsDirectory },
			dependencies.liveness,
		);
	});
	if (await analysisInFlight(request.run, dependencies)) {
		throw new LaunchRefusalError(
			`An analysis of run ${request.run} is already in flight; read its result when it ends`,
			HTTP_STATUS_CONFLICT,
		);
	}

	const capUsd = browserAnalysisCapUsd(ceilingUsd);
	if (capUsd !== request.statedUsd) {
		throw new LaunchRefusalError(
			`An analysis can now spend at most $${capUsd.toFixed(USD_FRACTION_DIGITS)}, not the $${request.statedUsd.toFixed(USD_FRACTION_DIGITS)} the dialog stated; reopen it to read the current cost`,
			HTTP_STATUS_CONFLICT,
		);
	}

	return {
		argv: [
			"diagnose",
			request.run,
			"--model",
			BROWSER_ANALYSIS_MODEL,
			"--budget-usd",
			String(capUsd),
		],
		target: { kind: "analysis", run: request.run, usd: capUsd },
	};
}

/**
 * Whether an analysis of this run is among the launches run history lists as
 * running, so the refusal and the screen agree. A record that does not read
 * refuses nothing, so one corrupt file cannot block every analysis.
 */
async function analysisInFlight(
	run: string,
	{ runsDirectory, liveness }: Readonly<LaunchDependencies>,
): Promise<boolean> {
	const { launches } = await liveLaunches(runsDirectory, liveness);

	return launches.some(
		(launch) => launch.kind === "analysis" && launch.run === run,
	);
}

export { analysisLaunch as default };
