import {
	assertPlanningStageCompleted,
	readTaskCard,
	readTaskOutput,
} from "#benchmark/backlog";
import { captureStageCorpus } from "#benchmark/checkpoint";
import {
	captureCheckIntegrity,
	captureTreatmentChecks,
} from "#benchmark/checks";
import type { CorpusRoot } from "#benchmark/corpus-file";
import {
	measureCorpusVersion,
	measuredCorpusFiles,
} from "#benchmark/corpus-version";
import type { StageSessionDependencies } from "#benchmark/stage-session-dependencies";
import {
	assertBuildCommitted,
	captureBuildCandidate,
	changedPathsBetween,
} from "#benchmark/target";
import { runWorkflowStage } from "#benchmark/workflow";
import type { CommandOutput } from "#cli/output";
import { diagnosticWriter } from "#cli/output";

interface StageSessionRuntimeContext {
	readonly corpusSource: CorpusRoot;
	readonly recordsDirectory: () => string;
	readonly output: CommandOutput;
}
class StageSessionRuntime implements StageSessionDependencies {
	readonly #context: StageSessionRuntimeContext;
	public readonly assertBuildCommitted = assertBuildCommitted;
	public readonly assertPlanningStageCompleted = assertPlanningStageCompleted;
	public readonly captureBuildCandidate = captureBuildCandidate;
	public readonly captureCheckIntegrity = captureCheckIntegrity;
	public readonly captureStageCorpus = captureStageCorpus;
	public readonly captureTreatmentChecks: StageSessionDependencies["captureTreatmentChecks"] =
		async (targetDir, checks) =>
			await captureTreatmentChecks(
				targetDir,
				checks,
				diagnosticWriter(this.#context.output),
			);
	public readonly changedPathsBetween = changedPathsBetween;
	public readonly corpusVersionFiles: StageSessionDependencies["corpusVersionFiles"] =
		async (measurement) => {
			const { recordsDirectory } = this.#context;

			return await measuredCorpusFiles(recordsDirectory(), measurement);
		};
	public readonly measureCorpus: StageSessionDependencies["measureCorpus"] =
		async () => {
			const { recordsDirectory } = this.#context;

			return await measureCorpusVersion(
				recordsDirectory(),
				this.#context.corpusSource,
			);
		};
	public readonly readTaskCard = readTaskCard;
	public readonly readTaskOutput = readTaskOutput;
	public readonly runWorkflowStage = runWorkflowStage;
	public constructor(context: StageSessionRuntimeContext) {
		this.#context = context;
	}
}
export { StageSessionRuntime as default };
export type { StageSessionRuntimeContext };
