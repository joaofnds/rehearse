import {
	CaseDeclarationError,
	declaredTarget,
	readCaseDeclaration,
} from "#benchmark/case";
import { stageCorpusRoots } from "#benchmark/checkpoint";
import type { ReplayCliConfig } from "#benchmark/config";
import { parseReplayArgs } from "#benchmark/config";
import type { CorpusRoot } from "#benchmark/corpus-file";
import { readCorpusInstructions } from "#benchmark/corpus-file";
import type { CorpusSourceResolver } from "#benchmark/corpus-source";
import { resolveCorpusSource } from "#benchmark/corpus-source";
import { loadCurrentStageSettings } from "#benchmark/current-stage-settings";
import { loadRunManifest } from "#benchmark/manifest";
import type { LoadedStageSettings } from "#benchmark/stage-settings";
import { asUsageError } from "#cli/command-usage";
import corpusRefusal from "#cli/corpus-failures";

/**
 * The knobs a replay with these arguments runs, filled from the environment
 * and the run's manifest where the arguments leave them out.
 */
async function replayConfig(
	args: readonly string[],
	manifestFile: string,
): Promise<ReplayCliConfig> {
	const declared = await declaredSessionKnobs(manifestFile);

	return asUsageError(() => parseReplayArgs(args, Bun.env, declared));
}

/**
 * The model and budget the replayed run's case declares today, read before
 * the rest of replay's flags so they can stand in for --model and
 * --session-budget-usd. A case that no longer loads, renamed or deleted
 * since the run, leaves replay to the flags and environment alone rather
 * than refusing a replay those still cover.
 */
async function declaredSessionKnobs(manifestFile: string): Promise<{
	readonly model?: string | undefined;
	readonly sessionBudgetUsd?: number | undefined;
}> {
	try {
		const manifest = await loadRunManifest(manifestFile);
		const declaration = await readCaseDeclaration(manifest.caseId);

		return {
			model: declaration.model,
			sessionBudgetUsd: declaration.sessionBudgetUsd,
		};
	} catch (error) {
		if (error instanceof CaseDeclarationError) {
			return {};
		}

		throw error;
	}
}

/**
 * The settings file the replayed run's case declares today, the same path a
 * fresh run of that case would resolve. A case that no longer loads, renamed
 * or deleted since the run, or that is not a pipeline case, falls back to
 * the harness's own default rather than refusing the replay: the same
 * tolerance `declaredSessionKnobs` applies to model and budget.
 */
async function replaySettingsFile(
	manifestFile: string,
): Promise<LoadedStageSettings> {
	const manifest = await loadRunManifest(manifestFile);

	return await loadCurrentStageSettings(manifest.caseId);
}

/**
 * The target a fresh run of the replayed run's case would use, which holds the
 * commits a run starts from once the repositories the run recorded are gone.
 * A session case declares none, and a case that no longer loads leaves replay
 * to the recorded repositories alone: the tolerance `declaredSessionKnobs`
 * applies.
 */
async function replayDeclaredTarget(
	manifestFile: string,
): Promise<string | undefined> {
	try {
		const manifest = await loadRunManifest(manifestFile);
		const declaration = await readCaseDeclaration(manifest.caseId);

		return declaration.kind === "pipeline"
			? declaredTarget(declaration)
			: undefined;
	} catch (error) {
		if (error instanceof CaseDeclarationError) {
			return undefined;
		}

		throw error;
	}
}

/**
 * The project-level corpus a replay confirmation freezes before any worktree
 * exists: the target the replayed run recorded, since the run's end removed
 * its checkout and the control repository is not the project under test. A
 * single replay searches the worktree it builds instead (`replay.ts`).
 */
async function replayCorpusRoots(
	manifestFile: string,
	source: CorpusRoot,
): Promise<readonly CorpusRoot[]> {
	const manifest = await loadRunManifest(manifestFile);

	return stageCorpusRoots(source, manifest.targetRoot ?? manifest.sourceRoot);
}

/**
 * A replay exists to iterate on a corpus, so a corpus directory, named or
 * linked, is both the instructions the stage reads and the reason the session
 * is told to prefer the project level. The live install needs neither, because
 * a session reads it by default.
 */
async function replayCorpus(
	corpus: string | undefined,
	resolveCorpus: CorpusSourceResolver = resolveCorpusSource,
): Promise<{
	readonly instructions: string;
	readonly source: CorpusRoot;
	readonly settingSources: "project" | undefined;
}> {
	try {
		const source = await resolveCorpus(corpus);

		return {
			instructions: await readCorpusInstructions(source),
			settingSources: source.kind === "live" ? undefined : "project",
			source,
		};
	} catch (error) {
		if (error instanceof Error) {
			const refusal = corpusRefusal(error);
			if (refusal !== undefined) {
				throw refusal;
			}
		}

		throw error;
	}
}

export {
	replayConfig,
	replayCorpus,
	replayCorpusRoots,
	replayDeclaredTarget,
	replaySettingsFile,
};
