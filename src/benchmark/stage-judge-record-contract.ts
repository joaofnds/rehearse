import type { HashedFile } from "./checkpoint";
import type { Effort, WorkflowStage } from "./config";
import type { CorpusMeasurement } from "./corpus-measurement";
import type { HumanReview } from "./human-review-contract";
import type { JudgeAgreementReport } from "./judge-agreement";
import type { JudgeAttempt } from "./judge-attempt";
import type { JudgeGrade, StageJudgeOutput } from "./judge-grade-contract";
import type { ReadManifestEntry } from "./read-manifest";
import type { StageLetterGrade, StageRubric } from "./stage-rubric-contract";
import type { StageJudgeInput } from "./workflow-stage-contract";

interface StageGrade extends StageJudgeOutput {
	readonly grade: StageLetterGrade;
	readonly verdict: "CONTINUE" | "STOP";
}

interface StageScorecard {
	readonly judgeContractSha256?: string | undefined;
	readonly stage: WorkflowStage;
	readonly rubricPath: string;
	readonly rubric: StageRubric;
	readonly input: StageJudgeInput;
	readonly prompt: string;
	readonly attempts: readonly JudgeAttempt[];
	readonly costUsd: number;
	readonly grade: StageGrade;
}

interface StageJudgeRecord extends StageScorecard {
	readonly corpusFiles: readonly HashedFile[];
	readonly corpusVersion: CorpusMeasurement;
	readonly readManifest: readonly ReadManifestEntry[];
	readonly model: string;
	readonly judgeModel: string;
	readonly judgeEffort?: Effort | undefined;
	readonly sessionBudgetUsd: number;
	readonly effort?: Effort | undefined;
	readonly elapsedMs?: number | undefined;
	readonly calibration?: CalibrationResult | undefined;
	readonly judgeAgreement?: JudgeAgreementReport | undefined;
}

interface CalibrationResult {
	readonly humanReview: HumanReview;
	readonly instructionsChanged: boolean;
	readonly updatedInstructions?: string | undefined;
	readonly rubricChanged: boolean;
	readonly updatedRubric?: string | undefined;
	readonly revisedRubricIds?: readonly string[] | undefined;
	readonly revisedJudgePrompt?: string | undefined;
	readonly revisedJudgeContractSha256?: string | undefined;
	readonly revisedGrade?: JudgeGrade | undefined;
	readonly rejudgeConfirmedByHuman?: boolean | undefined;
	readonly stageRubricsChanged: readonly WorkflowStage[];
	readonly revisedStageScorecards?: readonly StageScorecard[] | undefined;
}

export type { StageGrade, StageScorecard, StageJudgeRecord, CalibrationResult };
