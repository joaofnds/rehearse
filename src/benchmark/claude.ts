import type { z } from "zod";
import type { Effort } from "./config";
import type { ClaudeCallMetrics, ClaudeEnvelope } from "./contracts";
import {
	claudeCallMetricsSchema,
	claudeEnvelopeSchema,
	claudeJsonSchema,
} from "./contracts";

export interface SessionSettings {
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly budgetUsd: number;
}

export interface ClaudeInvocation {
	readonly settings: SessionSettings;
	readonly schema: z.ZodType;
	readonly access: "unrestricted" | "sealed";
	readonly systemPrompt?: string | undefined;
	readonly session?:
		| { readonly id: string; readonly resume: boolean }
		| undefined;
	readonly settingSources?: "project" | undefined;
	readonly settingsOverlay?: string | undefined;
}

export function claudeArgs(invocation: ClaudeInvocation): string[] {
	const {
		settings,
		schema,
		access,
		systemPrompt,
		session,
		settingSources,
		settingsOverlay,
	} = invocation;

	return [
		"claude",
		"-p",
		...(access === "sealed"
			? ["--safe-mode", "--disable-slash-commands", "--strict-mcp-config"]
			: []),
		"--model",
		settings.model,
		...(settings.effort ? ["--effort", settings.effort] : []),
		"--max-budget-usd",
		String(settings.budgetUsd),
		"--output-format",
		"json",
		"--json-schema",
		claudeJsonSchema(schema),
		...(access === "sealed"
			? ["--tools", ""]
			: ["--dangerously-skip-permissions"]),
		...(systemPrompt === undefined ? [] : ["--system-prompt", systemPrompt]),
		...(session
			? [session.resume ? "--resume" : "--session-id", session.id]
			: ["--no-session-persistence"]),
		...(settingSources === undefined
			? []
			: ["--setting-sources", settingSources]),
		...(settingsOverlay === undefined ? [] : ["--settings", settingsOverlay]),
	];
}

/**
 * The provider names why it stopped in `terminal_reason`, and a budget halt
 * reports what it spent getting there while carrying no `result` at all, so
 * a caller that reads only the message cannot tell that cause from a rejected
 * model. The message stays what it always was; callers that need the cause
 * narrow on this type.
 */
export class ClaudeSessionError extends Error {
	public readonly terminalReason: string | undefined;
	public readonly costUsd: number | undefined;

	public constructor(envelope: ClaudeEnvelope) {
		super(envelope.result ?? "Claude session failed");
		this.name = "ClaudeSessionError";
		this.terminalReason = envelope.terminal_reason;
		this.costUsd = envelope.total_cost_usd;
	}
}

export function readClaudeEnvelope(output: string): ClaudeEnvelope {
	const envelope = claudeEnvelopeSchema.parse(JSON.parse(output));
	if (envelope.is_error === true) {
		throw new ClaudeSessionError(envelope);
	}

	return envelope;
}

export function readClaudeCallMetrics(
	envelope: ClaudeEnvelope,
): ClaudeCallMetrics | undefined {
	const metrics = claudeCallMetricsSchema.safeParse({
		costUsd: envelope.total_cost_usd,
		inputTokens: envelope.usage?.input_tokens,
		outputTokens: envelope.usage?.output_tokens,
		cacheReadTokens: envelope.usage?.cache_read_input_tokens,
		cacheWriteTokens: envelope.usage?.cache_creation_input_tokens,
		turns: envelope.num_turns,
		durationMs: envelope.duration_ms,
		apiDurationMs: envelope.duration_api_ms,
		modelUsage: envelope.modelUsage,
	});
	if (!metrics.success) {
		return undefined;
	}

	return withoutAbsentModelUsage(metrics.data);
}

/**
 * A key carrying `undefined` would serialize into a saved record as an empty
 * per-model block, which reads as a call that used no model rather than a CLI
 * that reported none.
 */
function withoutAbsentModelUsage(
	metrics: ClaudeCallMetrics,
): ClaudeCallMetrics {
	if (metrics.modelUsage !== undefined) {
		return metrics;
	}

	const rest = { ...metrics };
	delete rest.modelUsage;

	return rest;
}

export function readStructuredOutput<T>(
	envelope: ClaudeEnvelope,
	schema: z.ZodType<T>,
): T {
	if (envelope.structured_output !== undefined) {
		return schema.parse(envelope.structured_output);
	}

	if (envelope.result !== undefined && envelope.result !== "") {
		return schema.parse(JSON.parse(envelope.result));
	}

	throw new Error("Claude response did not contain structured output");
}
