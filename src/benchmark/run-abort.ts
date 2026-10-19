import RunAbortArtifactLifecycle from "./run-abort-artifact-lifecycle";
import type {
	RunAbort,
	RunAbortDependencies,
	RunAbortRequest,
} from "./run-abort-contracts";
import RunAbortEvents from "./run-abort-events";
import RunAbortRecovery from "./run-abort-recovery";
import { RunAbortSignals } from "./run-abort-signals";
import RunAbortStageLifecycle from "./run-abort-stage-lifecycle";
import RunAbortTransitions from "./run-abort-transitions";

function createRunAbort(
	dependencies: RunAbortDependencies,
	request: RunAbortRequest,
): RunAbort {
	const transitions = new RunAbortTransitions();
	const events = new RunAbortEvents(dependencies);
	const stages = new RunAbortStageLifecycle({
		events,
		persistence: dependencies.persistence,
		transitions,
	});
	const artifacts = new RunAbortArtifactLifecycle({
		events,
		file: request.artifactFile,
		persistence: dependencies.persistence,
		transitions,
	});
	const recovery = new RunAbortRecovery({
		artifacts,
		dependencies,
		events,
		request,
		stages,
		transitions,
	});
	const signals = new RunAbortSignals({ dependencies, recovery, request });

	signals.register();

	return {
		awaitArtifactReview: artifacts.awaitArtifactReview,
		completeArtifact: artifacts.completeArtifact,
		completeStage: stages.completeStage,
		markAborted: recovery.markAborted,
		release: signals.release,
		stopAtCeiling: stages.stopAtCeiling,
		teardown: signals.teardown,
		updatePendingStage: stages.updatePendingStage,
		writeFailedArtifact: artifacts.writeFailedArtifact,
		writePendingArtifact: artifacts.writePendingArtifact,
		writePendingStage: stages.writePendingStage,
		writeStageProgress: stages.writeStageProgress,
	};
}

export { createRunAbort };

export {
	fileRunArtifactPersistence,
	writeRunArtifact,
} from "./run-abort-artifact-records";

export { RUN_SIGNALS, signalExitCode } from "./run-abort-signals";

export { writeStageJudgeFailure } from "./run-abort-stage-records";

export type {
	PendingStage,
	OperatorStop,
	CeilingStopReadings,
	CeilingStop,
	StoppedStageReadings,
	RunAbortDependencies,
	RunAbortRequest,
	RunAbort,
	RunArtifactPersistence,
} from "./run-abort-contracts";
