import type { CheckpointRecord } from "./checkpoint";
import type { BenchmarkConfig } from "./config";
import type {
	CalibrationResult,
	ContextFile,
	FailedJudgeRunArtifact,
	GradedRunArtifact,
	LocalCheckResult,
	RunArtifactEvidence,
	StageScorecard,
	StageTranscript,
} from "./contracts";
import type { JudgeResult } from "./judge";
import type { JudgeAgreementReport } from "./judge-agreement";
import type { PipelineDefinition } from "./pipeline";
import type { PaidJudgeFailure } from "./run-final-judgment";
import type { SourceBaseline } from "./target";
import type { ProductOwnerSnapshot } from "./workflow";

interface BuildEvidence {
	readonly resultSha: string;
	readonly diff: string;
	readonly changedPaths: readonly string[];
	readonly checkIntegrity: LocalCheckResult;
	readonly localChecks: LocalCheckResult;
	readonly taskState: string;
}

/**
 * The clone a run works in, and the target it was cloned from, which keeps the
 * run's commits once the clone is removed.
 */
interface RunSource extends SourceBaseline {
	readonly targetRoot: string;
}

interface RunArtifactBaseInputs {
	readonly timestamp: string;
	readonly controlSha: string;
	readonly source: RunSource;
	readonly taskSha: string;
	readonly config: BenchmarkConfig;
	readonly pipeline: PipelineDefinition;
	readonly claudeVersion: string;
	readonly task: string;
	readonly productBrief: string;
	readonly instructions: string;
	readonly rubric: string;
	readonly rubricIds: readonly string[];
	readonly baselineContext: readonly ContextFile[];
	readonly taskId: string;
	readonly productOwner: ProductOwnerSnapshot;
	readonly workflow: readonly StageTranscript[];
	readonly stageScorecards: readonly StageScorecard[];
	readonly checkpoints: readonly CheckpointRecord[];
	readonly evidence: BuildEvidence;
	readonly elapsedMs?: number | undefined;
}

interface RunArtifactInputs extends RunArtifactBaseInputs {
	readonly judge: JudgeResult;
	readonly reviewFile: string;
}

type RecordedJudgeEvidence = Pick<
	JudgeResult,
	"prompt" | "attempts" | "costUsd" | "judgeContractSha256"
>;

function runArtifactEvidence(
	inputs: RunArtifactBaseInputs,
	judge: RecordedJudgeEvidence,
): RunArtifactEvidence {
	const { source, config, evidence, productOwner } = inputs;

	return {
		baselineContext: inputs.baselineContext,
		bunVersion: Bun.version,
		caseId: config.caseId,
		changedPaths: evidence.changedPaths,
		checkIntegrity: evidence.checkIntegrity,
		checkpoints: inputs.checkpoints,
		claudeVersion: inputs.claudeVersion.trim(),
		controlSha: inputs.controlSha,
		diff: evidence.diff,
		effort: config.effort,
		elapsedMs: inputs.elapsedMs,
		instructions: inputs.instructions,
		judgeAttempts: judge.attempts,
		judgeContractSha256: judge.judgeContractSha256,
		judgeCostUsd: judge.costUsd,
		judgeEffort: config.judgeEffort,
		judgeModel: config.judgeModel,
		judgePrompt: judge.prompt,
		localChecks: evidence.localChecks,
		model: config.model,
		pipeline: inputs.pipeline,
		pipelinePath: config.pipelinePath,
		productBrief: inputs.productBrief,
		productOwnerCostUsd: productOwner.spentUsd,
		productOwnerProviderCalls: productOwner.providerCalls,
		productOwnerSessionId: productOwner.sessionId,
		resultSha: evidence.resultSha,
		rubric: inputs.rubric,
		rubricIds: inputs.rubricIds,
		sessionBudgetUsd: config.sessionBudgetUsd,
		sourceOrigin: source.origin,
		sourceRoot: source.root,
		sourceSha: source.sha,
		stageScorecards: inputs.stageScorecards,
		targetRoot: source.targetRoot,
		task: inputs.task,
		taskId: inputs.taskId,
		taskSha: inputs.taskSha,
		taskState: evidence.taskState,
		timestamp: inputs.timestamp,
		workflow: inputs.workflow,
	};
}

function buildRunArtifact(inputs: RunArtifactInputs): GradedRunArtifact {
	return {
		...runArtifactEvidence(inputs, inputs.judge),
		grade: inputs.judge.grade,
		reviewFile: inputs.reviewFile,
		status: "AWAITING_HUMAN_REVIEW",
	};
}

/**
 * The one transition that finishes a graded run's artifact. Generic over the
 * artifact so the command that completes a record it parsed back off disk
 * uses this rather than restating the status literal: a typo in "COMPLETE"
 * would type-check as a widened string and produce an artifact
 * `loadJudgeAgreementReport` skips forever without saying so.
 */
function completeRunArtifact<T extends { readonly status: string }>(
	artifact: T,
	calibration: CalibrationResult,
	judgeAgreement: JudgeAgreementReport,
): T & CompletedRunArtifact {
	return {
		...artifact,
		calibration,
		judgeAgreement,
		status: "COMPLETE",
	};
}

interface CompletedRunArtifact {
	readonly status: "COMPLETE";
	readonly calibration: CalibrationResult;
	readonly judgeAgreement: JudgeAgreementReport;
}

function buildFailedJudgeRunArtifact(
	inputs: RunArtifactBaseInputs,
	{ failure, ceilingStop }: Readonly<PaidJudgeFailure>,
): FailedJudgeRunArtifact {
	return {
		...runArtifactEvidence(inputs, failure),
		ceilingStop,
		failure: failure.message,
		judgeProviderCalls: failure.providerCalls,
		status: "FAILED",
	};
}

export { buildRunArtifact, completeRunArtifact, buildFailedJudgeRunArtifact };

export type {
	BuildEvidence,
	RunSource,
	RunArtifactBaseInputs,
	RunArtifactInputs,
};
