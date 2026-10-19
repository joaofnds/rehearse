import type {
	assertPlanningStageCompleted,
	readTaskCard,
	readTaskOutput,
} from "./backlog";
import type { HashedFile, captureStageCorpus } from "./checkpoint";
import type { captureCheckIntegrity } from "./checks";
import type { LocalCheckResult } from "./contracts";
import type { CorpusMeasurement } from "./corpus-measurement";
import type { TargetCheck } from "./pipeline";
import type {
	assertBuildCommitted,
	captureBuildCandidate,
	changedPathsBetween,
} from "./target";
import type { runWorkflowStage } from "./workflow";

interface StageSessionDependencies {
	readonly runWorkflowStage: typeof runWorkflowStage;
	readonly readTaskOutput: typeof readTaskOutput;
	readonly readTaskCard: typeof readTaskCard;
	readonly captureBuildCandidate: typeof captureBuildCandidate;
	readonly assertPlanningStageCompleted: typeof assertPlanningStageCompleted;
	readonly assertBuildCommitted: typeof assertBuildCommitted;
	readonly changedPathsBetween: typeof changedPathsBetween;
	readonly captureCheckIntegrity: typeof captureCheckIntegrity;
	readonly captureTreatmentChecks: (
		targetDir: string,
		checks: readonly TargetCheck[],
	) => Promise<LocalCheckResult>;
	readonly captureStageCorpus: typeof captureStageCorpus;
	readonly measureCorpus: () => Promise<CorpusMeasurement>;
	readonly corpusVersionFiles: (
		measurement: CorpusMeasurement,
	) => Promise<readonly HashedFile[]>;
}

export type { StageSessionDependencies };
