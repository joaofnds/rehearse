import { z } from "zod";

import { claudeCallMetricsSchema } from "./claude-envelope-contract";
import type { ClaudeCallMetrics } from "./claude-envelope-contract";
import type { WorkflowStage } from "./config";
import type { Immutable } from "./contracts";
import { evidenceSchema } from "./judge-evidence-contract";
import type { StageKind } from "./pipeline";

const stageTurnSchema = z.object({
	message: z
		.string()
		.nonempty()
		.describe(
			"One question with its recommendation and context, or a concise completion summary",
		),
	status: z
		.enum(["QUESTION", "COMPLETE"])
		.describe(
			"QUESTION when product input is required; COMPLETE only after the native skill has finished and saved its durable artifact",
		),
});

const productAnswerSchema = z.object({
	answer: z.string().nonempty(),
});

type StageTurn = Immutable<z.infer<typeof stageTurnSchema>>;

interface ContextFile {
	readonly path: string;
	readonly content: string;
}

interface LocalCheckResult {
	readonly status: "PASS" | "FAIL";
	readonly evidence: readonly Immutable<z.infer<typeof evidenceSchema>>[];
}

interface StageExchange {
	readonly agent: StageTurn;
	readonly productOwnerAnswer?: string | undefined;
}

interface ProviderCall {
	readonly metrics?: ClaudeCallMetrics | undefined;
}

interface StageTranscript {
	readonly stage: WorkflowStage;
	readonly sessionId: string;
	readonly costUsd: number;
	readonly providerCalls: readonly ProviderCall[];
	readonly exchanges: readonly StageExchange[];
}

interface StageJudgeInput {
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

const contextFileSchema = z.object({
	content: z.string(),
	path: z.string(),
});

const localCheckResultSchema = z.object({
	evidence: z.array(evidenceSchema),
	status: z.enum(["PASS", "FAIL"]),
});

const transcriptProviderCallSchema = z.object({
	metrics: claudeCallMetricsSchema.optional(),
});

const transcriptExchangeSchema = z.object({
	agent: stageTurnSchema,
	productOwnerAnswer: z.string().optional(),
});

const stageTranscriptSchema = z.object({
	costUsd: z.number(),
	exchanges: z.array(transcriptExchangeSchema),
	providerCalls: z.array(transcriptProviderCallSchema),
	sessionId: z.string(),
	stage: z.string().nonempty(),
});

const stageJudgeInputSchema = z.looseObject({
	artifact: contextFileSchema.optional(),
	baselineContext: z.array(contextFileSchema),
	changedPaths: z.array(z.string()).optional(),
	checkIntegrity: localCheckResultSchema.optional(),
	commitSubjects: z.array(z.string()).optional(),
	diff: z.string().optional(),
	harnessFailure: z.string().optional(),
	instructions: z.string(),
	kind: z.enum(["planning", "delivery"]),
	localChecks: localCheckResultSchema.optional(),
	priorArtifacts: z.array(contextFileSchema),
	productBrief: z.string(),
	stage: z.string().nonempty(),
	task: z.string(),
	taskState: z.string(),
	transcript: stageTranscriptSchema,
});

export {
	stageTurnSchema,
	productAnswerSchema,
	contextFileSchema,
	localCheckResultSchema,
	stageTranscriptSchema,
	stageJudgeInputSchema,
};
export type {
	StageTurn,
	ContextFile,
	LocalCheckResult,
	StageExchange,
	ProviderCall,
	StageTranscript,
	StageJudgeInput,
};
