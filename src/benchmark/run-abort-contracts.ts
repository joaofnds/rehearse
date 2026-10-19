import type {
	FailedJudgeRunArtifact,
	RunArtifact,
	StageJudgeRecord,
} from "./contracts";
import type { SignalRegistration } from "./process-signals";
import type { CeilingStop, PendingStage } from "./run-abort-stage-contracts";
import type { RunEventRecorder } from "./run-events";

interface RunAbortDependencies extends SignalRegistration {
	readonly killActiveCommands: () => Promise<void>;
	readonly reportError: (message: string) => void;
	readonly persistence: RunArtifactPersistence;
	readonly runEvents?: RunEventRecorder | undefined;
	/**
	 * Milliseconds elapsed since the run started, not a raw clock: the caller
	 * owns the one origin a run has, so this and workflow.ts's WorkflowStageRequest
	 * carry the same shape rather than each capturing its own `Date.now()` at
	 * construction. Two independent origins previously made elapsed time jump
	 * backward at every stage boundary.
	 */
	readonly elapsedMs?: (() => number) | undefined;
}

interface RunAbortRequest {
	readonly artifactFile: string;
	readonly operatorStopFile: string;
	readonly teardown: () => Promise<void>;
}

interface RunAbort {
	readonly writePendingStage: (pending: PendingStage) => Promise<void>;
	readonly updatePendingStage: (pending: PendingStage) => void;
	readonly writeStageProgress: (record: StageJudgeRecord) => Promise<void>;
	readonly completeStage: (record: StageJudgeRecord) => Promise<void>;
	readonly writePendingArtifact: (artifact: RunArtifact) => Promise<void>;
	readonly completeArtifact: (artifact: RunArtifact) => Promise<void>;
	readonly awaitArtifactReview: () => Promise<void>;
	readonly writeFailedArtifact: (
		artifact: FailedJudgeRunArtifact,
	) => Promise<void>;
	readonly markAborted: (reason: string) => Promise<void>;
	readonly stopAtCeiling: (stop: CeilingStop) => void;
	readonly teardown: () => Promise<void>;
	readonly release: () => void;
}

interface RunArtifactPersistence {
	readonly write: (path: string, contents: string) => Promise<void>;
}

export type {
	RunAbortDependencies,
	RunAbortRequest,
	RunAbort,
	RunArtifactPersistence,
};

export type {
	PendingStage,
	OperatorStop,
	CeilingStopReadings,
	CeilingStop,
	StoppedStageReadings,
} from "./run-abort-stage-contracts";
