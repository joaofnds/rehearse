import { z } from "zod";

import type { Immutable } from "./contracts";

const claudeUsageSchema = z
	.object({
		cache_creation_input_tokens: z.number().int().nonnegative(),
		cache_read_input_tokens: z.number().int().nonnegative(),
		input_tokens: z.number().int().nonnegative(),
		output_tokens: z.number().int().nonnegative(),
	})
	.loose();

const claudeModelUsageSchema = z
	.object({
		cacheCreationInputTokens: z.number().int().nonnegative(),
		cacheReadInputTokens: z.number().int().nonnegative(),
		contextWindow: z.number().int().nonnegative(),
		costUSD: z.number().nonnegative(),
		inputTokens: z.number().int().nonnegative(),
		maxOutputTokens: z.number().int().nonnegative(),
		outputTokens: z.number().int().nonnegative(),
	})
	.loose();

const claudeModelUsageByModelSchema = z.record(
	z.string(),
	claudeModelUsageSchema,
);

const claudeCallMetricsSchema = z
	.object({
		apiDurationMs: z.number().int().nonnegative().optional(),
		cacheReadTokens: z.number().int().nonnegative(),
		cacheWriteTokens: z.number().int().nonnegative(),
		costUsd: z.number().nonnegative(),
		durationMs: z.number().int().nonnegative().optional(),
		inputTokens: z.number().int().nonnegative(),
		// The session's running figures as the provider reports them, so on a
		// resumed call they include earlier calls, unlike costUsd and the tokens.
		modelUsage: claudeModelUsageByModelSchema.optional(),
		outputTokens: z.number().int().nonnegative(),
		turns: z.number().int().nonnegative(),
	})
	.strict();

const claudeEnvelopeSchema = z
	.object({
		duration_api_ms: z.number().int().nonnegative().optional(),
		duration_ms: z.number().int().nonnegative().optional(),
		errors: z
			.array(z.string())
			.optional()
			.or(z.unknown().transform((): undefined => undefined)),
		is_error: z.boolean().optional(),
		// Recording-only evidence whose shape moves between CLI releases, so a
		// block that no longer fits is dropped rather than failing a paid call.
		modelUsage: claudeModelUsageByModelSchema
			.optional()
			.or(z.unknown().transform((): undefined => undefined)),
		num_turns: z.number().int().nonnegative().optional(),
		result: z.string().optional(),
		session_id: z.string().nonempty(),
		structured_output: z.unknown().optional(),
		terminal_reason: z.string().optional(),
		total_cost_usd: z.number().nonnegative().optional(),
		usage: claudeUsageSchema.optional(),
	})
	.loose();

type ClaudeEnvelope = Immutable<z.infer<typeof claudeEnvelopeSchema>>;

type ClaudeCallMetrics = Immutable<z.infer<typeof claudeCallMetricsSchema>>;

type ClaudeModelUsage = Immutable<z.infer<typeof claudeModelUsageSchema>>;

export {
	claudeModelUsageSchema,
	claudeCallMetricsSchema,
	claudeEnvelopeSchema,
};
export type { ClaudeEnvelope, ClaudeCallMetrics, ClaudeModelUsage };
