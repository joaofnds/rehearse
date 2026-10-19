import type {
	BenchmarkRunInputs,
	BenchmarkRunInteraction,
} from "./benchmark-run-request";
import RunExecution from "./run-execution";
import prepareRunIdentity from "./run-identity";
import type { BenchmarkRunPaths } from "./run-layout";
import { openRunLifetime } from "./run-lifetime";
import RunOutput from "./run-output";
import { createSpendCeiling } from "./spend-ceiling";

async function runBenchmark(
	inputs: BenchmarkRunInputs,
	interaction: BenchmarkRunInteraction,
): Promise<BenchmarkRunPaths> {
	const output = new RunOutput(interaction.progress);
	const { pipeline } = inputs.benchmarkCase;
	const spendCeiling = createSpendCeiling({
		ceilingUsd: interaction.spendCeilingUsd,
	});
	const identity = await prepareRunIdentity(inputs.config);
	const lifetime = await openRunLifetime({ identity, output, spendCeiling });
	const source = await lifetime.clone();
	const execution = new RunExecution({
		identity,
		inputs,
		interaction,
		lifetime,
		output,
		pipeline,
		source,
		spendCeiling,
	});
	return await execution.run();
}

export { default as buildRunManifest } from "./run-manifest";

export {
	buildRunArtifact,
	completeRunArtifact,
	buildFailedJudgeRunArtifact,
} from "./run-artifact";

export { runFinalJudge, judgeRun } from "./run-final-judgment";

export {
	pausesOnFailure,
	pauseForFailureInspection,
	finishGradedRun,
} from "./run-review-completion";

export { retainedCheckpointRecorder, retentionInTarget } from "./run-retention";

export {
	stageSessionsWithServices,
	executeStageSession,
} from "./stage-session";

export { default as RunPausedError } from "./run-stage-context";

export {
	captureRunBaseline,
	ordinaryInitialCheckpointInputs,
} from "./run-baseline";

export type {
	BuildEvidence,
	RunSource,
	RunArtifactBaseInputs,
	RunArtifactInputs,
} from "./run-artifact";

export type { RunManifestInputs } from "./run-manifest";

export type { PaidJudgeFailure, FinalJudgeRequest } from "./run-final-judgment";

export type {
	FinalCalibrationInput,
	FinishGradedRunRequest,
	FinishGradedRunDependencies,
} from "./run-review-completion";

export type { StageSessionDependencies } from "./stage-session-dependencies";

export type { StageDependencies, StageOutcome } from "./run-stage-contract";

export type { StageContext } from "./run-stage-context";

export type {
	StageSessionEnvironment,
	StageSessionResult,
} from "./stage-session-contract";

export { liveRunDiagnostics } from "./run-diagnostics";

export type { RunDiagnostics } from "./run-diagnostics";

export { runBenchmark };

export { default as runGradedStages } from "./run-graded-stages";
