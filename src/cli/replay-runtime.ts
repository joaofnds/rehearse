import type { CorpusRoot } from "#benchmark/corpus-file";
import type { ReplayDependencies } from "#benchmark/replay";
import { repositoryHolding } from "#benchmark/run-repositories";
import { runStageJudge } from "#benchmark/stage-grading";
import { loadStageRubric } from "#benchmark/stage-rubric";
import { currentSha } from "#benchmark/target";
import { createProductOwner } from "#benchmark/workflow";
import type { CommandOutput } from "#cli/output";

import PipelineConfirmationWorkspaceRuntime from "./pipeline-confirmation-workspace";
import StageSessionRuntime from "./stage-session-runtime";

interface ReplayRuntimeContext {
	readonly corpusSource: CorpusRoot;
	readonly output: CommandOutput;
	readonly runsDirectory: string;
}

class ReplayRuntime
	extends PipelineConfirmationWorkspaceRuntime
	implements ReplayDependencies
{
	public readonly createProductOwner = createProductOwner;
	public readonly currentSha = currentSha;
	public readonly loadStageRubric = loadStageRubric;
	public readonly replaySourceRoot = repositoryHolding;
	public readonly runStageJudge = runStageJudge;
	public readonly stageSession: StageSessionRuntime;
	public constructor({
		corpusSource,
		output,
		runsDirectory,
	}: ReplayRuntimeContext) {
		super({ output });
		this.stageSession = new StageSessionRuntime({
			corpusSource,
			output,
			recordsDirectory: () => runsDirectory,
		});
	}
}

export { ReplayRuntime as default };
