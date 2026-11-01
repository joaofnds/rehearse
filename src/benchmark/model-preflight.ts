import { z } from "zod";

import {
	ClaudeSessionError,
	claudeArgs,
	readClaudeCallMetrics,
	readClaudeEnvelope,
	spendUsd,
} from "./claude";
import runClaudeCommand from "./claude-command";
import { CommandError, runCommand } from "./command";
import { CONTROL_DIR } from "./config";
import type { ClaudeCallMetrics } from "./contracts";
import { RefusedPreconditionError } from "./exit-codes";

const BUDGET_DECIMAL_PLACES = 2;

type ModelProbe = () => Promise<string>;

type ClaudeHelpRunner = (
	command: readonly string[],
	cwd: string,
) => Promise<string>;

const SYSTEM_PROMPT_SNAPSHOT_CAPABILITY = "--system-prompt-snapshot <on|off>";

/**
 * A resumed case needs the current system prompt to be rendered from its
 * declared settings and corpus. Capability discovery uses local CLI help so an
 * incompatible executable is refused before the paid model probe.
 */
async function assertSystemPromptSnapshotSupported(
	run: ClaudeHelpRunner = runCommand,
): Promise<void> {
	const readClaudeHelp = async (): Promise<string> => {
		try {
			return await run(["claude", "--help"], CONTROL_DIR);
		} catch (error) {
			const detail = error instanceof Error ? `: ${error.message}` : "";
			throw new RefusedPreconditionError(
				`Resumed session cases require Claude CLI support for ${SYSTEM_PROMPT_SNAPSHOT_CAPABILITY}, but \`claude --help\` failed${detail}`,
			);
		}
	};

	const help = await readClaudeHelp();

	if (!help.includes(SYSTEM_PROMPT_SNAPSHOT_CAPABILITY)) {
		throw new RefusedPreconditionError(
			`Resumed session cases require Claude CLI support for ${SYSTEM_PROMPT_SNAPSHOT_CAPABILITY}, but \`claude --help\` did not advertise it`,
		);
	}
}

type ModelPreflightEvidence =
	| {
			readonly status: "COMPLETE";
			readonly call: { readonly metrics: ClaudeCallMetrics };
	  }
	| { readonly status: "MISSING"; readonly missing: string };

const MODEL_PROBE_PROMPT = "hi";
/**
 * Sized for a cold prompt cache, not just a warm one: a cache-creation write
 * on the probe's own system prompt measured $0.021876 in this session, which
 * a $0.02 ceiling rejected as `budget_exhausted` and this module then
 * misreported as the model being unavailable.
 */
const MODEL_PREFLIGHT_MAXIMUM_USD = 0.1;
const modelProbeSchema = z.object({}).loose();

type CommandRunner = (
	command: readonly string[],
	cwd: string,
	options: { readonly input: string },
) => Promise<string>;

/**
 * The provider still writes the envelope to stdout on a rejected model, so a
 * `CommandError` here is read for that stdout rather than treated as the
 * probe's own failure; a failure with no stdout to read (the CLI missing
 * entirely) is not this precondition and is rethrown.
 */
function defaultModelProbe(
	model: string,
	run: CommandRunner = runClaudeCommand,
): ModelProbe {
	return async () => {
		try {
			return await run(
				claudeArgs({
					access: "sealed",
					schema: modelProbeSchema,
					settings: { budgetUsd: MODEL_PREFLIGHT_MAXIMUM_USD, model },
				}),
				CONTROL_DIR,
				{ input: MODEL_PROBE_PROMPT },
			);
		} catch (error) {
			if (error instanceof CommandError) {
				return error.stdout;
			}

			throw error;
		}
	};
}

/**
 * A throwaway completion under the declared model, read through the envelope
 * rather than the process exit code: an unrecognized or unentitled model still
 * exits the CLI process in a way that varies by release, but the envelope's
 * `is_error` is the one signal `readClaudeEnvelope` already commits to reading.
 * `readClaudeEnvelope` throws `ClaudeSessionError` only for that signal; a
 * malformed response throws `SyntaxError` or a zod error instead, and those
 * name a probe or provider problem, not an unavailable model, so only the
 * session error is relabeled here.
 */
async function probeModelAvailable(
	model: string,
	invoke: ModelProbe,
): Promise<ModelPreflightEvidence> {
	const output = await invoke();
	try {
		const envelope = readClaudeEnvelope(output);
		const metrics = readClaudeCallMetrics(envelope);

		return metrics === undefined
			? { missing: "preflight call metrics", status: "MISSING" }
			: { call: { metrics }, status: "COMPLETE" };
	} catch (error) {
		if (!(error instanceof ClaudeSessionError)) {
			throw error;
		}

		throw new RefusedPreconditionError(refusalFor(model, error));
	}
}

const BUDGET_EXHAUSTED_REASON = "budget_exhausted";

function refusalFor(
	model: string,
	error: Readonly<ClaudeSessionError>,
): string {
	if (error.terminalReason !== BUDGET_EXHAUSTED_REASON) {
		return `Model ${model} is not available: ${error.message}. Re-declare a model this session can run, or check your entitlement for it.`;
	}

	const spent =
		error.costUsd === undefined
			? "an amount the provider did not report"
			: `$${spendUsd(error.costUsd)}`;

	return `The ${model} availability probe exhausted its own budget, spending ${spent} against its $${MODEL_PREFLIGHT_MAXIMUM_USD.toFixed(BUDGET_DECIMAL_PLACES)} budget. The model itself was not rejected; retry once the prompt cache is warm.`;
}

/**
 * `run`'s full gate composes the probe with the target and settings checks
 * below; `replay` and `calibrate` spend under a declared model with neither of
 * those, so they call this composition directly.
 */
async function defaultProbeModel(
	model: string,
	run?: CommandRunner,
): Promise<ModelPreflightEvidence> {
	return await probeModelAvailable(model, defaultModelProbe(model, run));
}

async function defaultAssertModelAvailable(
	model: string,
	run?: CommandRunner,
): Promise<void> {
	await defaultProbeModel(model, run);
}

export {
	assertSystemPromptSnapshotSupported,
	MODEL_PREFLIGHT_MAXIMUM_USD,
	defaultModelProbe,
	probeModelAvailable,
	defaultProbeModel,
	defaultAssertModelAvailable,
};
export type {
	ModelProbe,
	ClaudeHelpRunner,
	ModelPreflightEvidence,
	CommandRunner,
};
