import type {
	CheckpointRecord,
	recordCheckpoint,
	resolveSkillDirectory,
} from "./checkpoint";
import type { StageScorecard, StageTranscript } from "./contracts";
import type { BuildEvidence } from "./run-artifact";
import type { runStageJudge } from "./stage-grading";
import type { StageSessionDependencies } from "./stage-session-dependencies";
import type { snapshotCheckout } from "./target";

interface StageDependencies extends StageSessionDependencies {
	readonly runStageJudge: typeof runStageJudge;
	readonly resolveSkillDirectory: typeof resolveSkillDirectory;
	readonly recordCheckpoint: typeof recordCheckpoint;
	readonly snapshotCheckout: typeof snapshotCheckout;
}

interface StageOutcome {
	readonly workflow: readonly StageTranscript[];
	readonly stageScorecards: readonly StageScorecard[];
	readonly checkpoints: readonly CheckpointRecord[];
	readonly buildEvidence?: BuildEvidence | undefined;
}

export type { StageDependencies, StageOutcome };
