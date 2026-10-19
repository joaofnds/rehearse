import type { HashedFile } from "./checkpoint";
import type { SessionAttemptId, StageAttemptId } from "./run-layout";

interface RecordedRunsContext {
	readonly runsDirectory: string;
	readonly settingsFile: HashedFile;
	readonly sourceRoot: string;
	readonly stageAttemptFile: string;
	readonly sessionAttemptFile: string;
	readonly replayableRun: string;
	readonly unreplayableRun: string;
	readonly groupId: string;
	readonly comparisonDigest: string;
	readonly stages: readonly string[];
	readonly sessionAttempt: SessionAttemptId;
	readonly stageAttempt: StageAttemptId;
	readonly stoppedRun: string;
	readonly noRecordRun: string;
	readonly interruptedRun: string;
	readonly runningRun: string;
	readonly laterRunningRun: string;
	readonly abortedRun: string;
	readonly awaitingJudgeRun: string;
	readonly eventsOnlyRun: string;
	readonly unrecordedArtifactRun: string;
}

interface RecordedRunsFixtureProps {
	readonly context: RecordedRunsContext;
}

export type { RecordedRunsContext, RecordedRunsFixtureProps };
