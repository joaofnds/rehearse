import { seedTaskBoard } from "#benchmark/backlog";
import type { BenchmarkConfig } from "#benchmark/config";
import { recordsDirectory } from "#benchmark/config";
import type { CorpusRoot } from "#benchmark/corpus-file";
import { runJudge } from "#benchmark/judge";
import type { PipelineConfirmationDependencies } from "#benchmark/pipeline-confirmation-dependencies";
import { runStageJudge } from "#benchmark/stage-grading";
import { createProductOwner } from "#benchmark/workflow";
import type { CommandOutput } from "#cli/output";

import PipelineConfirmationWorkspaceRuntime from "./pipeline-confirmation-workspace";
import StageSessionRuntime from "./stage-session-runtime";

interface PipelineConfirmationRuntimeContext {
	readonly config: BenchmarkConfig;
	readonly corpusSource: CorpusRoot;
	readonly output: CommandOutput;
}
class PipelineConfirmationRuntime
	extends PipelineConfirmationWorkspaceRuntime
	implements PipelineConfirmationDependencies
{
	readonly #config: BenchmarkConfig;
	public readonly createProductOwner = createProductOwner;
	public readonly runFinalJudge: PipelineConfirmationDependencies["runFinalJudge"] =
		async (request) =>
			await runJudge(
				{
					budget: {
						sessionBudgetUsd: this.#config.sessionBudgetUsd,
						spendCeiling: request.spendCeiling,
					},
					effort: this.#config.judgeEffort,
					model: this.#config.judgeModel,
				},
				{
					baselineContext: request.baselineContext,
					changedPaths: request.evidence.changedPaths,
					checkIntegrity: request.evidence.checkIntegrity,
					diff: request.evidence.diff,
					localChecks: request.evidence.localChecks,
					rubric: request.rubric,
				},
			);
	public readonly runStageJudge = runStageJudge;
	public readonly seedTaskBoard = seedTaskBoard;
	public readonly stageSession: StageSessionRuntime;
	public constructor({
		config,
		corpusSource,
		output,
	}: PipelineConfirmationRuntimeContext) {
		super({ output });
		this.#config = config;
		this.stageSession = new StageSessionRuntime({
			corpusSource,
			output,
			recordsDirectory,
		});
	}
}
export { PipelineConfirmationRuntime as default };
