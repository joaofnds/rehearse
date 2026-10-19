import {
	judgeSelfPreferenceWarning,
	parseReplayConfirmation,
	parseRunName,
	recordsDirectory,
} from "#benchmark/config";
import { benchmarkRunPaths, recordedRunNames } from "#benchmark/run-layout";
import { asUsageError } from "#cli/command-usage";
import {
	RefusedPreconditionError,
	requireInteractiveStdin,
	requireSpendAuthorization,
} from "#cli/interactive-stdin";
import { writeDiagnostic } from "#cli/output";

import { replayConfig } from "./replay-case-inputs";
import type {
	ReplayCommandDependencies,
	ReplayCommandRequest,
} from "./replay-command-contracts";
import reportOutcome from "./replay-command-output";

async function runReplayCommand(
	request: ReplayCommandRequest,
	dependencies: ReplayCommandDependencies,
): Promise<void> {
	const runName = await resolvedRunName(request, dependencies);
	const paths = benchmarkRunPaths(recordsDirectory(), runName);
	const config = await replayConfig(request.args, paths.manifestFile);

	requireSpendAuthorization(request.args, Bun.env, request.stdinIsTerminal);

	writeDiagnostic(dependencies.output, judgeSelfPreferenceWarning(config));

	const spendCeilingUsd =
		await dependencies.requireSpendCeiling(recordsDirectory());
	await dependencies.probeModel(config.model);

	const outcome = await dependencies.execute(
		{ config, paths },
		{ output: dependencies.output, spendCeilingUsd },
	);

	await reportOutcome({ config, paths, request }, outcome, dependencies.output);
}

async function resolvedRunName(
	request: ReplayCommandRequest,
	dependencies: ReplayCommandDependencies,
): Promise<string> {
	const runName = asUsageError(() => parseRunName(request.args));

	requireReplayTerminal(request);
	await dependencies.resolveRunDirectory(runName);

	return runName;
}

function requireReplayTerminal(request: ReplayCommandRequest): void {
	const confirmation = asUsageError(() =>
		parseReplayConfirmation(request.args),
	);
	if (confirmation?.approval === "interactive") {
		requireInteractiveStdin(
			request.stdinIsTerminal,
			"approving the projected cost needs a TTY; pass --yes instead",
		);
	}
}

async function resolveRunDirectory(runName: string): Promise<string> {
	const paths = benchmarkRunPaths(recordsDirectory(), runName);
	if (await Bun.file(paths.manifestFile).exists()) {
		return paths.checkpointsDirectory;
	}

	const recorded = await recordedRunNames(paths.runsDirectory);

	throw new RefusedPreconditionError(
		`No replayable run named ${paths.name}; recorded runs: ${
			recorded.join(", ") || "none"
		}`,
	);
}

export {
	replayConfig,
	replayCorpus,
	replayCorpusRoots,
	replayDeclaredTarget,
	replaySettingsFile,
} from "./replay-case-inputs";
export type {
	ReplayCommandDependencies,
	ReplayCommandOutcome,
	ReplayCommandRequest,
	ReplayEvidence,
} from "./replay-command-contracts";
export { default as executeReplay } from "./replay-run-execution";
export { resolveRunDirectory, runReplayCommand };
