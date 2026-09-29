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
 * reports what it spent getting there while carrying no `result` at all, only
 * its `errors`. Callers that need the cause or the spend narrow on this type
 * rather than reading the message. A halt that states neither keeps the failed
 * command's message, which carries its exit code and stderr.
 */
export class ClaudeSessionError extends Error {
	public readonly terminalReason: string | undefined;
	public readonly costUsd: number | undefined;

	public constructor(
		envelope: ClaudeEnvelope,
		failure?: Readonly<CommandError>,
	) {
		super(
			statedFailure(envelope) ?? failure?.message ?? "Claude session failed",
			{ cause: failure },
		);
		this.name = "ClaudeSessionError";
		this.terminalReason = envelope.terminal_reason;
		this.costUsd = envelope.total_cost_usd;
	}
}

/**
 * A provider spend measures in thousandths of a dollar, so it keeps every digit
 * the provider reported rather than rounding to cents like the rest of this
 * project's money: `$0.02` against a `$0.10` cap tells the operator nothing
 * about how close the cap is. Plain interpolation would render a
 * sub-microdollar spend as `$1e-7`, which is not an amount anyone can read.
 */
export function spendUsd(costUsd: number): string {
	return costUsd.toFixed(8).replace(/0+$/u, "").replace(/\.$/u, "");
}

export function statedFailure(envelope: ClaudeEnvelope): string | undefined {
	if (envelope.result !== undefined && envelope.result !== "") {
		return envelope.result;
	}

	const errors = envelope.errors?.join("; ") ?? "";

	return errors === "" ? undefined : errors;
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

/** Runs a session whose output is its one json envelope. */
export async function runJsonSession(
	command: readonly string[],
	cwd: string,
	options: Parameters<typeof runCommand>[2] = {},
): Promise<string> {
	try {
		return await runCommand(command, cwd, options);
	} catch (error) {
		if (error instanceof CommandError) {
			throw sessionFailure(error);
		}

		throw error;
	}
}

/**
 * The CLI exits non-zero on a session it halted, a budget halt among them,
 * and still writes the envelope saying what the session spent. Read as a
 * bare command failure, that spend is never charged to the ceiling.
 */
function sessionFailure(
	error: Readonly<CommandError>,
): CommandError | ClaudeSessionError {
	const envelope = failedCommandEnvelope(error);
	return envelope?.is_error === true
		? new ClaudeSessionError(envelope, error)
		: error;
}

/** The envelope a failed command wrote, whatever its `is_error` says. */
export function failedCommandEnvelope(
	error: Readonly<CommandError>,
): ClaudeEnvelope | undefined {
	let output: unknown;
	try {
		output = JSON.parse(error.stdout);
	} catch {
		return undefined;
	}

	const envelope = claudeEnvelopeSchema.safeParse(output);

	return envelope.success ? envelope.data : undefined;
}

/** The envelope a session wrote, read without judging its `is_error`. */
export function parseClaudeEnvelope(output: string): ClaudeEnvelope {
	return claudeEnvelopeSchema.parse(JSON.parse(output));
}

export function readClaudeEnvelope(output: string): ClaudeEnvelope {
	const envelope = parseClaudeEnvelope(output);
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
