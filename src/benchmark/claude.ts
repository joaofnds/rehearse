import { z } from "zod";

import runClaudeCommand from "./claude-command";
import { ClaudeSessionError, failedCommandEnvelope } from "./claude-response";
import { CommandError } from "./command";
import type { CommandOptions } from "./command";
import type { Effort } from "./config";
import type { SchemaPropertyOrder } from "./contracts";
import { claudeJsonSchema } from "./contracts";
import { actualSetupArgs } from "./session-setup";
import type { ActualSetupFiles } from "./session-setup";

interface SessionSettings {
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly budgetUsd: number;
}

interface ClaudeInvocation {
	readonly settings: SessionSettings;
	readonly schema: z.ZodType;
	readonly schemaOrder?: SchemaPropertyOrder;
	readonly access: "unrestricted" | "sealed";
	readonly systemPrompt?: string | undefined;
	readonly session?:
		| { readonly id: string; readonly resume: boolean }
		| undefined;
	/**
	 * The user's actual setup, whose merged settings file already carries any
	 * overlay. Without it the session reads every setting source, with the
	 * overlay passed on top.
	 */
	readonly setup?: ActualSetupFiles | undefined;
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

function settingsArgs(
	setup: ActualSetupFiles | undefined,
	settingsOverlay: string | undefined,
): string[] {
	if (setup !== undefined) {
		return actualSetupArgs(setup);
	}

	return settingsOverlay === undefined ? [] : ["--settings", settingsOverlay];
}

function claudeArgs(invocation: ClaudeInvocation): string[] {
	const {
		settings,
		schema,
		schemaOrder,
		access,
		systemPrompt,
		session,
		setup,
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
		claudeJsonSchema(schema, schemaOrder),
		...(access === "sealed"
			? ["--tools", ""]
			: ["--dangerously-skip-permissions"]),
		...(systemPrompt === undefined ? [] : ["--system-prompt", systemPrompt]),
		...(session
			? [session.resume ? "--resume" : "--session-id", session.id]
			: ["--no-session-persistence"]),
		...settingsArgs(setup, settingsOverlay),
	];
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

function readStreamResult(output: string): string {
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
async function runStreamedSession(
	command: readonly string[],
	cwd: string,
	options: CommandOptions = {},
): Promise<string> {
	try {
		return readStreamResult(await runClaudeCommand(command, cwd, options));
	} catch (error) {
		if (error instanceof CommandError) {
			throw sessionFailure(
				error.withStdout(streamResultLine(error.stdout) ?? ""),
			);
		}

		throw error;
	}
}

/** Runs a session whose output is its one json envelope. */
async function runJsonSession(
	command: readonly string[],
	cwd: string,
	options: CommandOptions = {},
): Promise<string> {
	try {
		return await runClaudeCommand(command, cwd, options);
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

export {
	claudeArgs,
	readStreamResult,
	runStreamedSession,
	runJsonSession,
	streamResultLine,
};
export type { SessionSettings, ClaudeInvocation };
export {
	ClaudeSessionError,
	statedFailure,
	failedCommandEnvelope,
	parseClaudeEnvelope,
	readClaudeEnvelope,
	readStructuredOutput,
} from "./claude-response";
export { spendUsd, readClaudeCallMetrics } from "./claude-metrics";
