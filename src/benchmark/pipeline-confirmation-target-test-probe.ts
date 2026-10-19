import type { TargetCheck } from "./pipeline";
import type { PipelineConfirmationDependencies } from "./pipeline-confirmation";

interface CheckPreparation {
	readonly targetDir: string;
	readonly setupComplete: boolean;
}

class PipelineTargetProbe {
	public readonly worktrees: string[] = [];
	public readonly setupDirectories: string[] = [];
	public readonly checkPreparation: CheckPreparation[] = [];
	private readonly prepared = new Set<string>();

	public readonly setupOverride = (
		dependencies: PipelineConfirmationDependencies,
	): PipelineConfirmationDependencies => ({
		...dependencies,
		addWorktree: async (root, sha, path) => {
			await dependencies.addWorktree(root, sha, path);

			this.worktrees.push(path);
		},
		runChecks: async (targetDir, checks, log) => {
			this.checkPreparation.push({
				setupComplete: this.prepared.has(targetDir),
				targetDir,
			});

			await dependencies.runChecks(targetDir, checks, log);
		},
		runSetup: async (targetDir, setup, log) => {
			await dependencies.runSetup(targetDir, setup, log);

			this.setupDirectories.push(targetDir);
			this.prepared.add(targetDir);
		},
		stageSession: {
			...dependencies.stageSession,
			captureTreatmentChecks: async (targetDir, checks) => {
				this.checkPreparation.push({
					setupComplete: this.prepared.has(targetDir),
					targetDir,
				});

				return await dependencies.stageSession.captureTreatmentChecks(
					targetDir,
					checks,
				);
			},
		},
	});
	public readonly events: string[] = [];
	public observedChecks: readonly TargetCheck[] | undefined;
	public observedIntegrityFiles: readonly string[] | undefined;
	public readonly treatmentCheckSets: (readonly TargetCheck[])[] = [];

	public readonly override = (
		dependencies: PipelineConfirmationDependencies,
	): PipelineConfirmationDependencies => ({
		...dependencies,
		captureFileHashes: async (targetDir, integrityFiles) => {
			this.events.push("integrity baseline");
			this.observedIntegrityFiles = integrityFiles;

			return await dependencies.captureFileHashes(targetDir, integrityFiles);
		},
		runChecks: async (_targetDir, { checks }) => {
			this.events.push("baseline checks");
			this.observedChecks = checks;

			await Promise.resolve();
		},
		seedTaskBoard: async (...args) => {
			this.events.push("task setup");

			return await dependencies.seedTaskBoard(...args);
		},
		stageSession: {
			...dependencies.stageSession,
			captureTreatmentChecks: async (targetDir, checks) => {
				this.treatmentCheckSets.push(checks);

				return await dependencies.stageSession.captureTreatmentChecks(
					targetDir,
					checks,
				);
			},
			runWorkflowStage: async (request) => {
				this.events.push("provider call");

				return await dependencies.stageSession.runWorkflowStage(request);
			},
		},
	});
}

export { PipelineTargetProbe as default };
