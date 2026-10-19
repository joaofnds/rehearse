import type { StageTranscriptSource } from "./checkpoint";
import type { StageJudgment } from "./judge-prompts";
import type { ReadManifestEntry } from "./read-manifest";
import type { PendingStage } from "./run-abort";
import type { StageContext } from "./run-stage-context";
import type { StageDependencies } from "./run-stage-contract";
import type { StageRunHistory } from "./run-stage-history";
import type { StageRunObservation } from "./run-stage-iteration";

interface StageJudgmentSources {
	readonly rubric: StageJudgment["source"];
	readonly readManifest: readonly ReadManifestEntry[];
}

interface PreparedStageJudgment extends StageJudgmentSources {
	readonly observation: StageRunObservation;
	readonly readStage: PendingStage;
	readonly stageTranscript: StageTranscriptSource | undefined;
}

interface StageJudgmentExecution {
	readonly dependencies: StageDependencies;
	readonly context: StageContext;
	readonly history: StageRunHistory;
	readonly prepared: PreparedStageJudgment;
}

export type {
	StageJudgmentSources,
	PreparedStageJudgment,
	StageJudgmentExecution,
};
