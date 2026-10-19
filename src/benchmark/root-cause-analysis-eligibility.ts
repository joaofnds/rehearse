import { RefusedPreconditionError } from "./exit-codes";
import type { AnalyzedRun } from "./root-cause-analysis";
import { recordedOutcome } from "./root-cause-bundle";
import { openRunEventStore } from "./run-events";
import { benchmarkRunPaths, runEventsDatabaseFile } from "./run-layout";
import type { RunLiveness } from "./run-liveness";
import { claimingRun, claimsLiveTarget } from "./run-liveness";
import { pausedStage } from "./run-pause";
import { createSpendCeiling } from "./spend-ceiling";

function analysisBudgetUsd(
	limits: Readonly<{ ceilingUsd: number; capUsd: number }>,
): number {
	return createSpendCeiling({ ceilingUsd: limits.ceilingUsd }).budgetFor(
		limits.capUsd,
	);
}

async function requireRecordedRun({
	runsDirectory,
	run,
}: AnalyzedRun): Promise<void> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	if (!(await Bun.file(paths.manifestFile).exists())) {
		throw new RefusedPreconditionError(`No run ${run} is recorded`);
	}
}

async function refuseUnanalyzable(
	analyzed: AnalyzedRun,
	liveness: RunLiveness,
): Promise<void> {
	await requireRecordedRun(analyzed);
	const { runsDirectory, run } = analyzed;
	if ((await recordedOutcome(runsDirectory, run)) !== undefined) {
		return;
	}

	const paths = benchmarkRunPaths(runsDirectory, run);
	if ((await pausedStage(paths)) !== undefined) {
		throw new RefusedPreconditionError(
			`Run ${run} ended paused before its final judge, so it has no outcome to analyze`,
		);
	}

	const claiming = await analysisClaimingRun(runsDirectory, run);

	if (await claimsLiveTarget(paths.manifestFile, liveness, claiming)) {
		throw new RefusedPreconditionError(
			`Run ${run} is still in flight, so it has no outcome to analyze`,
		);
	}
}

async function analysisClaimingRun(
	runsDirectory: string,
	run: string,
): Promise<ReturnType<typeof claimingRun>> {
	const runEvents = await openRunEventStore(
		runEventsDatabaseFile(runsDirectory),
	);
	const readClaimingRun = (): ReturnType<typeof claimingRun> => {
		try {
			return claimingRun(runEvents, run);
		} finally {
			runEvents.close();
		}
	};

	return readClaimingRun();
}

export { analysisBudgetUsd, requireRecordedRun, refuseUnanalyzable };
