import { z } from "zod";
import { CaseDeclarationError } from "./case";
import {
	ClaudeSessionError,
	claudeArgs,
	readClaudeCallMetrics,
	readClaudeEnvelope,
} from "./claude";
import { CommandError, runCommand } from "./command";
import { CONTROL_DIR } from "./config";
import { RefusedPreconditionError } from "./exit-codes";
import { PipelineDefinitionError } from "./pipeline";
import type { LoadedStageSettings } from "./stage-settings";
import { loadStageSettings, StageSettingsError } from "./stage-settings";
import { assertControlReady, assertSourceReady } from "./target";
import type { SourceBaseline } from "./target";
import type { ClaudeCallMetrics } from "./contracts";

const DECLARED_REFERENCE_ERRORS = [
	CaseDeclarationError,
	PipelineDefinitionError,
	StageSettingsError,
] as const;

/**
 * A bare `Error`, as opposed to one of its subclasses: the target checks
 * throw a plain `Error` for the one condition they name and let a subclassed
 * failure (`CommandError`, `SyntaxError`, a zod error) from a collaborator
 * they call propagate on its own account, so relabeling that collaborator's
 * failure as this check's own would discard what it already says.
 */
function isBareError(error: Readonly<Error>): boolean {
	return error.constructor === Error;
}

/**
 * A declared reference a case names but the loader cannot resolve — an
 * unreadable case, a missing pipeline, a missing stage settings file — is a
 * precondition the command refuses rather than a bug in the loader, so it
 * exits 3 with the loader's own message, which already names the path.
 */
export async function asRefusedPrecondition<Loaded>(
	load: () => Promise<Loaded>,
): Promise<Loaded> {
	try {
		return await load();
	} catch (error) {
		if (DECLARED_REFERENCE_ERRORS.some((kind) => error instanceof kind)) {
			throw new RefusedPreconditionError(
				error instanceof Error ? error.message : String(error),
			);
		}

		throw error;
	}
}

export type ModelProbe = () => Promise<string>;

export type ClaudeHelpRunner = (
	command: readonly string[],
	cwd: string,
) => Promise<string>;

const SYSTEM_PROMPT_SNAPSHOT_CAPABILITY = "--system-prompt-snapshot <on|off>";

/**
 * A resumed case needs the current system prompt to be rendered from its
 * declared settings and corpus. Capability discovery uses local CLI help so an
 * incompatible executable is refused before the paid model probe.
 */
export async function assertSystemPromptSnapshotSupported(
	run: ClaudeHelpRunner = runCommand,
): Promise<void> {
	let help: string;
	try {
		help = await run(["claude", "--help"], CONTROL_DIR);
	} catch (error) {
		const detail = error instanceof Error ? `: ${error.message}` : "";
		throw new RefusedPreconditionError(
			`Resumed session cases require Claude CLI support for ${SYSTEM_PROMPT_SNAPSHOT_CAPABILITY}, but \`claude --help\` failed${detail}`,
		);
	}

	if (!help.includes(SYSTEM_PROMPT_SNAPSHOT_CAPABILITY)) {
		throw new RefusedPreconditionError(
			`Resumed session cases require Claude CLI support for ${SYSTEM_PROMPT_SNAPSHOT_CAPABILITY}, but \`claude --help\` did not advertise it`,
		);
	}
}

export type ModelPreflightEvidence =
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
export const MODEL_PREFLIGHT_MAXIMUM_USD = 0.1;
const modelProbeSchema = z.object({}).loose();

export type CommandRunner = (
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
export function defaultModelProbe(
	model: string,
	run: CommandRunner = runCommand,
): ModelProbe {
	return async () => {
		try {
			return await run(
				claudeArgs({
					settings: { model, budgetUsd: MODEL_PREFLIGHT_MAXIMUM_USD },
					schema: modelProbeSchema,
					access: "sealed",
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
export async function probeModelAvailable(
	model: string,
	invoke: ModelProbe,
): Promise<ModelPreflightEvidence> {
	const output = await invoke();
	try {
		const envelope = readClaudeEnvelope(output);
		const metrics = readClaudeCallMetrics(envelope);

		return metrics === undefined
			? { status: "MISSING", missing: "preflight call metrics" }
			: { status: "COMPLETE", call: { metrics } };
	} catch (error) {
		if (!(error instanceof ClaudeSessionError)) {
			throw error;
		}

		throw new RefusedPreconditionError(refusalFor(model, error));
	}
}

const BUDGET_EXHAUSTED_REASON = "budget_exhausted";

/**
 * A probe halt measures in thousandths of a dollar, so the spend keeps every
 * digit the provider reported rather than rounding to cents like the rest of
 * this project's money: `$0.02` against a `$0.10` cap tells the operator
 * nothing about how close the ceiling is. Plain interpolation would render a
 * sub-microdollar spend as `$1e-7`, which is not an amount anyone can read.
 */
function spendUsd(costUsd: number): string {
	return costUsd.toFixed(8).replace(/0+$/u, "").replace(/\.$/u, "");
}

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

	return `The ${model} availability probe exhausted its own budget, spending ${spent} against its $${MODEL_PREFLIGHT_MAXIMUM_USD.toFixed(2)} budget. The model itself was not rejected; retry once the prompt cache is warm.`;
}

/**
 * `run`'s full gate composes the probe with the target and settings checks
 * below; `replay` and `calibrate` spend under a declared model with neither of
 * those, so they call this composition directly.
 */
export function defaultProbeModel(
	model: string,
	run?: CommandRunner,
): Promise<ModelPreflightEvidence> {
	return probeModelAvailable(model, defaultModelProbe(model, run));
}

export async function defaultAssertModelAvailable(
	model: string,
	run?: CommandRunner,
): Promise<void> {
	await defaultProbeModel(model, run);
}

export interface PipelinePreflightInputs {
	readonly sourceDir: string;
	readonly settingsFilePath: string;
	readonly model: string;
}

export interface PipelinePreflightDependencies {
	readonly assertControlReady: () => Promise<string>;
	readonly assertSourceReady: (sourceDir: string) => Promise<SourceBaseline>;
	readonly loadStageSettings: (path: string) => Promise<LoadedStageSettings>;
	readonly probeModel: (model: string) => Promise<void>;
}

const defaultPipelinePreflightDependencies: PipelinePreflightDependencies = {
	assertControlReady,
	assertSourceReady,
	loadStageSettings,
	probeModel: defaultAssertModelAvailable,
};

/**
 * Everything a pipeline run, replay, or confirmation would spend on before the
 * first stage: the target repository, the settings file every stage session
 * reads, and the model itself, checked last because it is the only step that
 * costs anything. Each check fails fast, so a target that is not ready is
 * reported without a wasted provider call for a model that was never going to
 * run against it.
 */
export async function assertPipelinePreflight(
	inputs: PipelinePreflightInputs,
	dependencies: PipelinePreflightDependencies = defaultPipelinePreflightDependencies,
): Promise<LoadedStageSettings> {
	await asTargetPrecondition(() => dependencies.assertControlReady());
	await asTargetPrecondition(() =>
		dependencies.assertSourceReady(inputs.sourceDir),
	);
	const loadedSettings = await asRefusedPrecondition(() =>
		dependencies.loadStageSettings(inputs.settingsFilePath),
	);
	await dependencies.probeModel(inputs.model);

	return loadedSettings;
}

/**
 * The target checks throw a plain `Error` naming what is wrong with the
 * repository (not the repository root, not on main, dirty, unrestored from a
 * previous run, or a missing directory's `ENOENT`, itself a plain `Error`):
 * every one of those is a precondition the run refuses, so the gate reports
 * it the same way as every other missing or invalid reference. A `git` call
 * inside those checks can also fail on its own account (`CommandError`), and
 * that failure already carries its own meaning and its own exit code:
 * relabeling it a refused precondition would discard both, so only a bare
 * `Error` is converted here.
 */
async function asTargetPrecondition<Value>(
	check: () => Promise<Value>,
): Promise<Value> {
	try {
		return await check();
	} catch (error) {
		if (error instanceof Error && isBareError(error)) {
			throw new RefusedPreconditionError(error.message);
		}

		throw error;
	}
}
