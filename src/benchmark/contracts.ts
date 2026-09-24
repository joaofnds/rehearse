import { z } from "zod";

import type { CheckpointRecord, HashedFile } from "./checkpoint";
import type { Effort, WorkflowStage } from "./config";
import { STAGE_LETTER_GRADES } from "./config";
import type { JudgeAttempt } from "./judge-attempt";
import type { JudgeAgreementReport } from "./judge-agreement";
import type { PipelineDefinition, StageKind } from "./pipeline";

/**
 * The deep-readonly view of a parsed value. Zod schemas describe the wire
 * shape; the domain passes their values around as immutable evidence, so
 * every derived type is wrapped here instead of sprinkling readonly through
 * each schema.
 */
export type Immutable<Value> = Value extends readonly (infer Element)[]
	? readonly Immutable<Element>[]
	: Value extends object
		? { readonly [Key in keyof Value]: Immutable<Value[Key]> }
		: Value;

/**
 * The `default` branch the lint rules require, written so it cannot swallow a
 * new union member: the parameter's `never` type makes an unhandled case a
 * compile error, and the throw is reachable only for a value the type says
 * cannot exist.
 */
export function unhandled(value: never, subject: string): never {
	throw new Error(`Unhandled ${subject}: ${JSON.stringify(value)}`);
}

export const evidenceSchema = z.object({
	source: z.enum(["diff", "baseline-context", "local-checks"]),
	path: z.string().min(1),
	claim: z.string().min(1),
});

export const judgeGradeSchema = z.object({
	requirements: z.array(
		z.object({
			id: z.string().min(1),
			status: z.enum(["PASS", "FAIL"]),
			evidence: z.array(evidenceSchema).min(1),
		}),
	),
	verdict: z.enum(["PASS", "FAIL"]),
	summary: z.string().min(1),
});

export const stageTurnSchema = z.object({
	status: z
		.enum(["QUESTION", "COMPLETE"])
		.describe(
			"QUESTION when product input is required; COMPLETE only after the native skill has finished and saved its durable artifact",
		),
	message: z
		.string()
		.min(1)
		.describe(
			"One question with its recommendation and context, or a concise completion summary",
		),
});

export const productAnswerSchema = z.object({
	answer: z.string().min(1),
});

export const stageLetterGradeSchema = z.enum(STAGE_LETTER_GRADES);

const stageRubricItemSchema = z.object({
	id: z.string().min(1),
	description: z.string().min(1),
});

export const stageRubricSchema = z.object({
	hardBlockers: z.array(stageRubricItemSchema),
	requirements: z.array(stageRubricItemSchema).min(1),
	dimensions: z
		.array(
			stageRubricItemSchema.extend({
				good: z.string().min(1),
				excellent: z.string().min(1),
			}),
		)
		.min(1),
});

const stageEvidenceListSchema = z
	.array(
		z.object({
			source: z.enum([
				"task",
				"product-brief",
				"instructions",
				"task-state",
				"transcript",
				"artifact",
				"prior-artifact",
				"baseline-context",
				"diff",
				"commit-subjects",
				"check-integrity",
				"local-checks",
				"harness-failure",
			]),
			path: z.string().min(1),
			claim: z.string().min(1),
		}),
	)
	.min(1);

const stagePassFailResultSchema = z.object({
	id: z.string().min(1),
	status: z.enum(["PASS", "FAIL"]),
	evidence: stageEvidenceListSchema,
});

export const stageJudgeOutputSchema = z.object({
	hardBlockers: z.array(stagePassFailResultSchema),
	requirements: z.array(stagePassFailResultSchema),
	dimensions: z.array(
		z.object({
			id: z.string().min(1),
			grade: stageLetterGradeSchema,
			evidence: stageEvidenceListSchema,
		}),
	),
	summary: z.string().min(1),
});

export const humanFindingSchema = z
	.object({
		description: z.string().min(1),
		paths: z.array(z.string().min(1)),
		stage: z.string().min(1).default("final"),
		judgeAssessment: z.enum([
			"CAUGHT",
			"MISSED",
			"FALSE_POSITIVE",
			"NOT_PROMOTED",
		]),
		rubricId: z.string().min(1).nullable(),
	})
	.superRefine((finding, context) => {
		if (
			finding.judgeAssessment === "NOT_PROMOTED" ||
			finding.rubricId !== null
		) {
			return;
		}

		context.addIssue({
			code: "custom",
			message: "Judge-related findings require a rubric ID",
			path: ["rubricId"],
		});
	});

export const humanReviewSchema = z.object({
	verdict: z.enum(["ACCEPT", "REJECT"]),
	summary: z.string().min(1),
	findings: z.array(humanFindingSchema),
});

/**
 * Loose, like the envelope around it: the usage object's shape is the
 * provider's, and it gains fields between releases. A strict schema here turns
 * a provider addition into a failed run, which is the opposite of what
 * recording usage is for.
 */
const claudeUsageSchema = z
	.object({
		input_tokens: z.number().int().nonnegative(),
		output_tokens: z.number().int().nonnegative(),
		cache_read_input_tokens: z.number().int().nonnegative(),
		cache_creation_input_tokens: z.number().int().nonnegative(),
	})
	.loose();

/**
 * Loose for the same reason as the usage object: the provider adds fields here
 * between releases. Probed 2026-09-14 on CLI 2.1.270, a sonnet call reported
 * webSearchRequests and thinkingTokens that a haiku call two hours earlier did
 * not.
 */
const claudeModelUsageSchema = z
	.object({
		inputTokens: z.number().int().nonnegative(),
		outputTokens: z.number().int().nonnegative(),
		cacheReadInputTokens: z.number().int().nonnegative(),
		cacheCreationInputTokens: z.number().int().nonnegative(),
		costUSD: z.number().nonnegative(),
		contextWindow: z.number().int().nonnegative(),
		maxOutputTokens: z.number().int().nonnegative(),
		canonicalModel: z.string().min(1),
		provider: z.string().min(1),
		costBasis: z.string().min(1),
	})
	.loose();

const claudeModelUsageByModelSchema = z.record(
	z.string(),
	claudeModelUsageSchema,
);

export const claudeCallMetricsSchema = z
	.object({
		costUsd: z.number().nonnegative(),
		inputTokens: z.number().int().nonnegative(),
		outputTokens: z.number().int().nonnegative(),
		cacheReadTokens: z.number().int().nonnegative(),
		cacheWriteTokens: z.number().int().nonnegative(),
		turns: z.number().int().nonnegative(),
		durationMs: z.number().int().nonnegative().optional(),
		apiDurationMs: z.number().int().nonnegative().optional(),
		modelUsage: claudeModelUsageByModelSchema.optional(),
	})
	.strict();

export const claudeEnvelopeSchema = z
	.object({
		session_id: z.string().min(1),
		total_cost_usd: z.number().nonnegative().optional(),
		num_turns: z.number().int().nonnegative().optional(),
		duration_ms: z.number().int().nonnegative().optional(),
		duration_api_ms: z.number().int().nonnegative().optional(),
		usage: claudeUsageSchema.optional(),
		modelUsage: claudeModelUsageByModelSchema.optional(),
		is_error: z.boolean().optional(),
		terminal_reason: z.string().optional(),
		result: z.string().optional(),
		structured_output: z.unknown().optional(),
	})
	.loose();

export type JudgeGrade = Immutable<z.infer<typeof judgeGradeSchema>>;
export type HumanReview = Immutable<z.infer<typeof humanReviewSchema>>;
export type StageTurn = Immutable<z.infer<typeof stageTurnSchema>>;
export type ClaudeEnvelope = Immutable<z.infer<typeof claudeEnvelopeSchema>>;
export type ClaudeCallMetrics = Immutable<
	z.infer<typeof claudeCallMetricsSchema>
>;
export type ClaudeModelUsage = Immutable<
	z.infer<typeof claudeModelUsageSchema>
>;
export type StageLetterGrade = z.infer<typeof stageLetterGradeSchema>;
export type StageRubric = Immutable<z.infer<typeof stageRubricSchema>>;
export type StageJudgeOutput = Immutable<
	z.infer<typeof stageJudgeOutputSchema>
>;

export class StageValidationError extends Error {
	public override name = "StageValidationError";
}

export interface ContextFile {
	readonly path: string;
	readonly content: string;
}

export interface LocalCheckResult {
	readonly status: "PASS" | "FAIL";
	readonly evidence: readonly Immutable<z.infer<typeof evidenceSchema>>[];
}

export interface StageExchange {
	readonly agent: StageTurn;
	readonly productOwnerAnswer?: string | undefined;
}

export interface ProviderCall {
	readonly metrics?: ClaudeCallMetrics | undefined;
}

export interface StageTranscript {
	readonly stage: WorkflowStage;
	readonly sessionId: string;
	readonly costUsd: number;
	readonly providerCalls: readonly ProviderCall[];
	readonly exchanges: readonly StageExchange[];
}

export interface StageJudgeInput {
	readonly stage: WorkflowStage;
	readonly kind: StageKind;
	readonly task: string;
	readonly productBrief: string;
	readonly instructions: string;
	readonly baselineContext: readonly ContextFile[];
	readonly taskState: string;
	readonly transcript: StageTranscript;
	readonly artifact?: ContextFile | undefined;
	readonly priorArtifacts: readonly ContextFile[];
	readonly diff?: string | undefined;
	readonly changedPaths?: readonly string[] | undefined;
	readonly commitSubjects?: readonly string[] | undefined;
	readonly checkIntegrity?: LocalCheckResult | undefined;
	readonly localChecks?: LocalCheckResult | undefined;
	readonly harnessFailure?: string | undefined;
}

export const contextFileSchema = z.object({
	path: z.string(),
	content: z.string(),
});

export const localCheckResultSchema = z.object({
	status: z.enum(["PASS", "FAIL"]),
	evidence: z.array(evidenceSchema),
});

const stageTranscriptSchema = z.object({
	stage: z.string().min(1),
	sessionId: z.string(),
	costUsd: z.number(),
	providerCalls: z.array(
		z.object({ metrics: claudeCallMetricsSchema.optional() }),
	),
	exchanges: z.array(
		z.object({
			agent: stageTurnSchema,
			productOwnerAnswer: z.string().optional(),
		}),
	),
});

export const stageJudgeInputSchema = z.looseObject({
	stage: z.string().min(1),
	kind: z.enum(["planning", "delivery"]),
	task: z.string(),
	productBrief: z.string(),
	instructions: z.string(),
	baselineContext: z.array(contextFileSchema),
	taskState: z.string(),
	transcript: stageTranscriptSchema,
	artifact: contextFileSchema.optional(),
	priorArtifacts: z.array(contextFileSchema),
	diff: z.string().optional(),
	changedPaths: z.array(z.string()).optional(),
	commitSubjects: z.array(z.string()).optional(),
	checkIntegrity: localCheckResultSchema.optional(),
	localChecks: localCheckResultSchema.optional(),
	harnessFailure: z.string().optional(),
});

const judgeAttemptSchema = z.intersection(
	z.looseObject({
		payload: z.unknown(),
		costUsd: z.number(),
		metrics: claudeCallMetricsSchema.optional(),
	}),
	z.union([
		z.looseObject({ outcome: z.literal("ACCEPTED") }),
		z.looseObject({ outcome: z.literal("REJECTED"), error: z.string() }),
	]),
);

export const judgeAttemptListSchema = z.array(judgeAttemptSchema);

export const stageGradeSchema = stageJudgeOutputSchema
	.extend({
		grade: stageLetterGradeSchema,
		verdict: z.enum(["CONTINUE", "STOP"]),
	})
	.loose();

/**
 * The scorecard as a schema, so a command that reads one back off disk proves
 * what it holds rather than asserting it. The interface below stays the shape
 * the harness writes; this is the same shape, parsed.
 *
 * Loose, like every shape `calibrate` parses, because `calibrate` writes back
 * what it parsed: a schema that strips deletes the field it does not know
 * about from every artifact it completes, and the first field a later card
 * adds here would go silently.
 */
export const stageScorecardSchema = z
	.object({
		stage: z.string().min(1),
		rubricPath: z.string().min(1),
		rubric: stageRubricSchema,
		input: stageJudgeInputSchema,
		prompt: z.string(),
		attempts: judgeAttemptListSchema,
		costUsd: z.number(),
		grade: stageGradeSchema,
	})
	.loose();

export interface StageGrade extends StageJudgeOutput {
	readonly grade: StageLetterGrade;
	readonly verdict: "CONTINUE" | "STOP";
}

export interface StageScorecard {
	readonly stage: WorkflowStage;
	readonly rubricPath: string;
	readonly rubric: StageRubric;
	readonly input: StageJudgeInput;
	readonly prompt: string;
	readonly attempts: readonly JudgeAttempt[];
	readonly costUsd: number;
	readonly grade: StageGrade;
}

export interface StageJudgeRecord extends StageScorecard {
	readonly corpusFiles: readonly HashedFile[];
	readonly model: string;
	readonly judgeModel: string;
	readonly judgeEffort?: Effort | undefined;
	readonly sessionBudgetUsd: number;
	readonly effort?: Effort | undefined;
	readonly elapsedMs?: number | undefined;
	readonly calibration?: CalibrationResult | undefined;
	readonly judgeAgreement?: JudgeAgreementReport | undefined;
}

export interface CalibrationResult {
	readonly humanReview: HumanReview;
	readonly instructionsChanged: boolean;
	readonly updatedInstructions?: string | undefined;
	readonly rubricChanged: boolean;
	readonly updatedRubric?: string | undefined;
	readonly revisedRubricIds?: readonly string[] | undefined;
	readonly revisedJudgePrompt?: string | undefined;
	readonly revisedGrade?: JudgeGrade | undefined;
	readonly rejudgeConfirmedByHuman?: boolean | undefined;
	readonly stageRubricsChanged: readonly WorkflowStage[];
	readonly revisedStageScorecards?: readonly StageScorecard[] | undefined;
}

export interface RunArtifactEvidence {
	readonly caseId: string;
	readonly timestamp: string;
	readonly controlSha: string;
	readonly sourceRoot: string;
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

export interface GradedRunArtifact extends RunArtifactEvidence {
	readonly status: "AWAITING_HUMAN_REVIEW" | "COMPLETE" | "FAILED";
	readonly grade: JudgeGrade;
	readonly reviewFile: string;
	readonly calibration?: CalibrationResult | undefined;
	readonly judgeAgreement?: JudgeAgreementReport | undefined;
}

export interface FailedJudgeRunArtifact extends RunArtifactEvidence {
	readonly status: "FAILED";
	readonly failure: string;
}

export type RunArtifact = GradedRunArtifact | FailedJudgeRunArtifact;

export function citationMatchesPath(
	citation: string,
	availablePaths: readonly string[],
): boolean {
	for (const candidate of new Set([citation, citation.split("#", 1)[0]])) {
		if (candidate === undefined || candidate === "") {
			continue;
		}

		try {
			const glob = new Bun.Glob(candidate);
			if (
				availablePaths.some(
					(path) =>
						path === candidate ||
						// A directory that contains supplied paths names them all.
						path.startsWith(`${candidate}/`) ||
						glob.match(path),
				)
			) {
				return true;
			}
		} catch {
			// A citation that is not a valid glob simply matches nothing.
		}
	}

	return false;
}

export function claudeJsonSchema(schema: z.ZodType): string {
	const compatibleEntries = Object.entries(z.toJSONSchema(schema)).filter(
		([key]) => key !== "$schema",
	);

	return JSON.stringify(Object.fromEntries(compatibleEntries));
}
