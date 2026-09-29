import { z } from "zod";
import { CommandError, runCommand } from "./command";
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
	/**
	 * `stream` writes each event as a line while the session runs, partial
	 * structured output included, and ends on a result line shaped like the
	 * `json` envelope. `readStreamResult` recovers that line. `events` writes
	 * the same lines without the partial messages, which still reports progress
	 * during a long tool call while keeping the held output small.
	 */
	readonly output?: "json" | "stream" | "events" | undefined;
}

function outputFormat(output: ClaudeInvocation["output"]): string[] {
	if (output === "stream") {
		return ["stream-json", "--verbose", "--include-partial-messages"];
	}

	if (output === "events") {
		return ["stream-json", "--verbose"];
	}

	return ["json"];
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
		output,
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
		...outputFormat(output),
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

const streamLineSchema = z.looseObject({ type: z.string() });

/** The result line a streamed session ends on. */
function streamResultLine(output: string): string | undefined {
	return output.split("\n").findLast((line) => {
		try {
			return streamLineSchema.parse(JSON.parse(line)).type === "result";
		} catch {
			return false;
		}
	});
}

export function readStreamResult(output: string): string {
	const result = streamResultLine(output);
	if (result === undefined) {
		throw new Error("Claude stream ended without a result");
	}

	return result;
}

/**
 * Runs a session whose output is streamed and resolves to its result line. A
 * failed session reports its result line as its output rather than every
 * streamed line, as a json session reports its one envelope.
 */
export async function runStreamedSession(
	command: readonly string[],
	cwd: string,
	options: Parameters<typeof runCommand>[2] = {},
): Promise<string> {
	try {
		return readStreamResult(await runCommand(command, cwd, options));
	} catch (error) {
		if (error instanceof CommandError) {
			throw sessionFailure(
				new CommandError(
					error.command,
					error.exitCode,
					streamResultLine(error.stdout) ?? "",
					error.stderr,
				),
			);
		}
		throw error;
	}
}

/**
 * The CLI exits non-zero on a session it halted, a budget halt among them,
 * and still writes the envelope saying what the session spent. Read as a
 * bare command failure, that spend is never charged to the ceiling.
 */
function sessionFailure(error: Readonly<CommandError>): Error {
	let output: unknown;
	try {
		output = JSON.parse(error.stdout);
	} catch {
		return error;
	}

	const envelope = claudeEnvelopeSchema.safeParse(output);

	return envelope.success && envelope.data.is_error === true
		? new ClaudeSessionError(envelope.data)
		: error;
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
