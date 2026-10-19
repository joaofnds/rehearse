import { planExtension } from "#benchmark/compare-attempts";
import { comparisonReportPaths } from "#benchmark/run-layout";
import {
	HTTP_STATUS_CONFLICT,
	HTTP_STATUS_NOT_FOUND,
} from "#server/http-status";
import { LaunchRefusalError, asLaunchRefusal } from "#server/launch-refusal";
import type { Launch } from "#server/launches-contract";

const USD_FRACTION_DIGITS = 2;

interface ExtensionLaunchRequest {
	readonly comparison: string;
	readonly attempts: number;
	readonly statedUsd: number;
}

/**
 * An extension replays a group in every arm, so what it would refuse for free
 * is refused here, and so is a cost other than the one the operator approved.
 */
async function extensionLaunch(
	request: ExtensionLaunchRequest,
	runsDirectory: string,
): Promise<Launch> {
	const { reportFile } = comparisonReportPaths(
		runsDirectory,
		request.comparison,
	);
	if (!(await Bun.file(reportFile).exists())) {
		throw new LaunchRefusalError(
			`No saved comparison ${request.comparison}`,
			HTTP_STATUS_NOT_FOUND,
		);
	}

	const { cost, armA } = await asLaunchRefusal(
		async () =>
			await planExtension({
				attemptsPerArm: request.attempts,
				comparison: request.comparison,
				runsDirectory,
			}),
	);
	if (cost.usd !== request.statedUsd) {
		throw new LaunchRefusalError(
			`Adding ${String(request.attempts)} attempts to each arm now costs about $${cost.usd.toFixed(USD_FRACTION_DIGITS)}, not the $${request.statedUsd.toFixed(USD_FRACTION_DIGITS)} the dialog stated; reopen it to read the current cost`,
			HTTP_STATUS_CONFLICT,
		);
	}

	return {
		argv: [
			"compare",
			"extend",
			"--comparison",
			request.comparison,
			"--attempts",
			String(request.attempts),
			"--yes",
			"--approved-in-browser",
		],
		target: {
			comparison: request.comparison,
			kind: "extension",
			...armA.checkpoint,
			attempts: request.attempts,
			usd: cost.usd,
		},
	};
}

export { extensionLaunch as default };
