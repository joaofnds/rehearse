import { unhandled } from "#benchmark/contracts";
import { caseArguments, replayArguments } from "#server/launch-arguments";
import comparisonLaunch from "#server/launch-comparison-plan";
import analysisLaunch from "#server/launches-analysis-launch";
import type {
	Launch,
	LaunchDependencies,
	LaunchRequest,
} from "#server/launches-contract";
import extensionLaunch from "#server/launches-extension-launch";
import { launchSpendCeiling } from "#server/launches-settings-reading";

interface LaunchPlanningContext {
	readonly request: LaunchRequest;
	readonly dependencies: LaunchDependencies;
	readonly spendCeilingUsd: number;
}

/**
 * The argv is built from the declaration and the run's manifest, and from
 * request strings only once they name a recorded case, run and stage.
 */
async function planLaunch(
	request: LaunchRequest,
	dependencies: LaunchDependencies,
): Promise<Launch> {
	const spendCeilingUsd = await launchSpendCeiling(dependencies.runsDirectory);
	return await planLaunchRequest({
		dependencies,
		request,
		spendCeilingUsd,
	});
}

async function planLaunchRequest({
	request,
	dependencies,
	spendCeilingUsd,
}: LaunchPlanningContext): Promise<Launch> {
	switch (request.kind) {
		case "case": {
			return {
				argv: await caseArguments(
					request.caseId,
					request.attempts,
					dependencies,
				),
				target: request,
			};
		}
		case "replay": {
			return {
				argv: await replayArguments(request, dependencies.runsDirectory),
				target: request,
			};
		}
		case "comparison": {
			return await comparisonLaunch(request, dependencies.runsDirectory);
		}
		case "extension": {
			return await extensionLaunch(request, dependencies.runsDirectory);
		}
		case "analysis": {
			return await analysisLaunch(request, dependencies, spendCeilingUsd);
		}
		default: {
			return unhandled(request, "launch request");
		}
	}
}

export { planLaunch as default };
