import { CaseDeclarationError } from "./case";
import { RefusedPreconditionError } from "./exit-codes";
import { defaultAssertModelAvailable } from "./model-preflight";
import { PipelineDefinitionError } from "./pipeline";
import type { LoadedStageSettings } from "./stage-settings";
import { StageSettingsError, loadStageSettings } from "./stage-settings";
import { assertControlReady, assertSourceReady } from "./target";
import type { SourceBaseline } from "./target";

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
async function asRefusedPrecondition<Loaded>(
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

interface PipelinePreflightInputs {
	readonly sourceDir: string;
	readonly settingsFilePath: string;
	readonly model: string;
}

interface PipelinePreflightDependencies {
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
async function assertPipelinePreflight(
	inputs: PipelinePreflightInputs,
	dependencies: PipelinePreflightDependencies = defaultPipelinePreflightDependencies,
): Promise<LoadedStageSettings> {
	await asTargetPrecondition(
		async () => await dependencies.assertControlReady(),
	);
	await asTargetPrecondition(
		async () => await dependencies.assertSourceReady(inputs.sourceDir),
	);
	const loadedSettings = await asRefusedPrecondition(
		async () => await dependencies.loadStageSettings(inputs.settingsFilePath),
	);
	await dependencies.probeModel(inputs.model);

	return loadedSettings;
}

/**
 * The target checks throw a plain `Error` naming what is wrong with the
 * repository (not the repository root, no main branch, an uncommitted control
 * repository, or a missing directory's `ENOENT`, itself a plain `Error`):
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

export { asRefusedPrecondition, assertPipelinePreflight };
export type { PipelinePreflightInputs, PipelinePreflightDependencies };
