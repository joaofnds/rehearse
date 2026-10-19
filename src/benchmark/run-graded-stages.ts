import { stageCorpusRoots } from "./checkpoint";
import acceptGradedStage from "./run-stage-checkpoint";
import type { StageContext } from "./run-stage-context";
import type { StageDependencies, StageOutcome } from "./run-stage-contract";
import GradedStageHistory from "./run-stage-history";
import judgePreparedStage from "./run-stage-judgment";
import type { StageJudgmentExecution } from "./run-stage-judgment-contract";
import prepareStageJudgment from "./run-stage-preparation";
import resolveStageSkills from "./run-stage-skills";
import beginGradedStage from "./run-stage-start";

async function runGradedStages(
	dependencies: StageDependencies,
	context: StageContext,
): Promise<StageOutcome> {
	const corpusRoots = stageCorpusRoots(context.corpusSource, context.targetDir);
	await resolveStageSkills(dependencies, context, corpusRoots);
	const history = new GradedStageHistory({
		initialLineage: context.initialLineage,
		taskSha: context.taskSha,
	});
	await Array.fromAsync(context.pipeline.stages, async (definition) => {
		const observation = await beginGradedStage({
			context,
			corpusRoots,
			definition,
			dependencies,
			history,
		});
		const prepared = await prepareStageJudgment({ context, observation });
		const request: StageJudgmentExecution = {
			context,
			dependencies,
			history,
			prepared,
		};
		await judgePreparedStage(request);
		await acceptGradedStage(request);
	});
	return history.outcome();
}

export { runGradedStages as default };
