import type { CheckpointRecord } from "./checkpoint";
import type { Effort } from "./config";
import type { JudgeAgreementReport } from "./judge-agreement";
import type { JudgeAttempt } from "./judge-attempt";
import type { JudgeGrade } from "./judge-grade-contract";
import type { PipelineDefinition } from "./pipeline";
import type {
	CalibrationResult,
	StageScorecard,
} from "./stage-judge-record-contract";
import type {
	ContextFile,
	LocalCheckResult,
	ProviderCall,
	StageTranscript,
} from "./workflow-stage-contract";

interface RunArtifactEvidence {
	readonly caseId: string;
	readonly timestamp: string;
	readonly controlSha: string;
	readonly sourceRoot: string;
	readonly targetRoot?: string | undefined;
	readonly sourceOrigin?: string | undefined;
	readonly sourceSha: string;
	readonly taskSha: string;
	readonly resultSha: string;
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly judgeModel: string;
	readonly judgeEffort?: Effort | undefined;
	readonly sessionBudgetUsd: number;
	readonly bunVersion: string;
	readonly claudeVersion: string;
	readonly task: string;
	readonly productBrief: string;
	readonly instructions: string;
	readonly rubric: string;
	readonly rubricIds: readonly string[];
	readonly pipelinePath: string;
	readonly pipeline: PipelineDefinition;
	readonly baselineContext: readonly ContextFile[];
	readonly taskId: string;
	readonly productOwnerSessionId: string;
	readonly productOwnerCostUsd: number;
	readonly productOwnerProviderCalls?: readonly ProviderCall[] | undefined;
	readonly workflow: readonly StageTranscript[];
	readonly stageScorecards: readonly StageScorecard[];
	readonly checkpoints: readonly CheckpointRecord[];
	readonly taskState: string;
	readonly judgePrompt: string;
	readonly judgeAttempts: readonly JudgeAttempt[];
	readonly judgeCostUsd: number;
	readonly diff: string;
	readonly changedPaths: readonly string[];
	readonly checkIntegrity: LocalCheckResult;
	readonly localChecks: LocalCheckResult;
	readonly elapsedMs?: number | undefined;
}

interface GradedRunArtifact extends RunArtifactEvidence {
	readonly status: "AWAITING_HUMAN_REVIEW" | "COMPLETE" | "FAILED";
	readonly grade: JudgeGrade;
	readonly reviewFile: string;
	readonly calibration?: CalibrationResult | undefined;
	readonly judgeAgreement?: JudgeAgreementReport | undefined;
}

interface FailedJudgeRunArtifact extends RunArtifactEvidence {
	readonly status: "FAILED";
	readonly failure: string;
	/** Every call the final Judge paid for, a halted one included. */
	readonly judgeProviderCalls: readonly ProviderCall[];
	/** The ceiling that refused the final Judge, when it was the ceiling. */
	readonly ceilingStop?:
		| { readonly ceilingUsd: number; readonly spentUsd: number }
		| undefined;
}

type RunArtifact = GradedRunArtifact | FailedJudgeRunArtifact;

export type {
	RunArtifactEvidence,
	GradedRunArtifact,
	FailedJudgeRunArtifact,
	RunArtifact,
};
