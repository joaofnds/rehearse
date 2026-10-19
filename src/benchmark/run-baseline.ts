import type { CheckpointInputs, RootLineageInputs } from "./checkpoint";
import { initialCheckpointInputs } from "./checkpoint";
import type { captureBaselineContext, captureFileHashes } from "./checks";
import { CommandError } from "./command";
import type { Effort } from "./config";
import type { ContextFile, LocalCheckResult } from "./contracts";
import { RefusedPreconditionError } from "./exit-codes";
import type { TargetCheck, TargetDefinition } from "./pipeline";
import type { LoadedStageSettings } from "./stage-settings";
import type { SourceBaseline, assertWorkspaceCleanAt } from "./target";

interface RunBaselineDependencies {
	readonly runSetup: (
		targetDir: string,
		setup: readonly TargetCheck[] | undefined,
	) => Promise<void>;
	readonly runChecks: (
		targetDir: string,
		label: string,
		checks: readonly TargetCheck[],
	) => Promise<void>;
	readonly assertWorkspaceCleanAt: typeof assertWorkspaceCleanAt;
	readonly captureFileHashes: typeof captureFileHashes;
	readonly captureBaselineContext: typeof captureBaselineContext;
}

interface RunBaseline {
	readonly baselineHashes: ReadonlyMap<string, string>;
	readonly baselineContext: readonly ContextFile[];
	readonly baselineChecks: LocalCheckResult;
}

/** A target command that exits non-zero is a precondition the run refuses. */
async function refusingFailedCommand(
	refusal: string,
	run: () => Promise<void>,
): Promise<void> {
	try {
		await run();
	} catch (error) {
		if (error instanceof CommandError) {
			throw new RefusedPreconditionError(
				`${refusal} (exit ${error.exitCode}): ${error.command.join(" ")}`,
			);
		}

		throw error;
	}
}

async function captureRunBaseline(
	dependencies: RunBaselineDependencies,
	source: SourceBaseline,
	target: TargetDefinition,
): Promise<RunBaseline> {
	await refusingFailedCommand("Target setup failed", async () => {
		await dependencies.runSetup(source.root, target.setup);
	});
	await refusingFailedCommand("Baseline check failed", async () => {
		await dependencies.runChecks(source.root, "Baseline checks", target.checks);
	});
	const baselineChecks: LocalCheckResult = {
		evidence: [
			{
				claim: "All baseline checks exited successfully",
				path: target.checks.map(({ command }) => command.join(" ")).join("; "),
				source: "local-checks",
			},
		],
		status: "PASS",
	};
	await dependencies.assertWorkspaceCleanAt(source.root, source.sha);
	const baselineHashes = await dependencies.captureFileHashes(
		source.root,
		target.integrityFiles,
	);
	const baselineContext = await dependencies.captureBaselineContext(
		source.root,
	);

	return { baselineChecks, baselineContext, baselineHashes };
}

interface InitialCheckpointSettings {
	readonly model: string;
	readonly effort: Effort | undefined;
	readonly loadedSettings: LoadedStageSettings;
}

function ordinaryInitialCheckpointInputs(
	root: RootLineageInputs,
	{ model, effort, loadedSettings }: InitialCheckpointSettings,
): CheckpointInputs {
	return initialCheckpointInputs(root, {
		effort,
		model,
		settingsFile: loadedSettings.hashed,
	});
}

export { captureRunBaseline, ordinaryInitialCheckpointInputs };

export type { RunBaseline };
