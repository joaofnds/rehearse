import type { ApprovalMethod, Effort } from "./config";
import type { ConfirmationCostProjection } from "./confirmation";
import type { StageRubric } from "./contracts";
import type { CorpusRoot } from "./corpus-file";
import type { PipelineDefinition } from "./pipeline";
import type { LoadedStageSettings } from "./stage-settings";
import type { SourceBaseline } from "./target";

interface LoadedStageRubric {
	readonly rubricPath: string;
	readonly content: string;
	readonly rubric: StageRubric;
}

interface PipelineConfirmationRequest {
	readonly runsDirectory: string;
	readonly caseId: string;
	readonly groupId: string;
	readonly reps: number;
	readonly projectedCost: ConfirmationCostProjection;
	readonly approvalMethod: ApprovalMethod;
	readonly source: SourceBaseline;
	readonly controlSha: string;
	readonly pipelinePath: string;
	readonly pipeline: PipelineDefinition;
	readonly task: string;
	readonly productBrief: string;
	readonly instructions: string;
	readonly finalRubric: string;
	readonly stageRubrics: Readonly<Record<string, LoadedStageRubric>>;
	readonly corpusRoots: readonly CorpusRoot[];
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly judgeModel: string;
	readonly judgeEffort?: Effort | undefined;
	readonly sessionBudgetUsd: number;
	readonly spendCeilingUsd: number;
	readonly loadedSettings?: LoadedStageSettings | undefined;
	readonly now?: (() => number) | undefined;
	/** Epoch milliseconds a start time is read from; Date.now unless a test pins it. */
	readonly wallClock?: (() => number) | undefined;
}

interface PipelineConfirmationOutcome {
	readonly groupRecordFile: string;
	readonly reportFile: string;
	readonly repRecordFiles: readonly string[];
}
export type {
	LoadedStageRubric,
	PipelineConfirmationRequest,
	PipelineConfirmationOutcome,
};
