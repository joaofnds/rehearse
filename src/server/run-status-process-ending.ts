import type { NonTerminalRunEvent } from "#benchmark/run-ending";
import type { RunEventStore } from "#benchmark/run-events";
import type { BenchmarkRunPaths } from "#benchmark/run-layout";
import type { RunIdentity } from "#server/run-status-contract";
import runningProgress from "#server/run-status-live-progress";
import { manifestBackedIdentity } from "#server/run-status-record-identity";

interface ProcessRun {
	readonly paths: BenchmarkRunPaths;
	readonly run: string;
}

async function runningIdentity(
	{ paths, run }: ProcessRun,
	latest: NonTerminalRunEvent,
	runEvents: RunEventStore,
): Promise<RunIdentity> {
	const progress = runningProgress({
		latest,
		stageStart: runEvents.latestStageStart({ runId: run, stage: latest.stage }),
	});

	return await manifestBackedIdentity(paths, "RUNNING", progress);
}

export { runningIdentity as default };
