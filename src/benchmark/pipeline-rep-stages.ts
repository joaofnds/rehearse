import type { ConfirmationRepResult } from "./confirmation-evidence";
import checkpointPipelineRep from "./pipeline-rep-checkpoint";
import { stopPipelineRep } from "./pipeline-rep-completion";
import type { PipelineStageInspection } from "./pipeline-rep-execution";
import judgePipelineStage from "./pipeline-rep-stage-judgment";
import executePipelineStageSession from "./pipeline-rep-stage-session";
import type {
	PipelineStageExecution,
	PreparedPipelineRep,
} from "./pipeline-rep-state";
import serialMap from "./serial-map";

function installedPipelineStages({
	scope,
	progress,
}: PreparedPipelineRep): AsyncGenerator<PipelineStageInspection> {
	const { frozen, plan } = scope.context;
	return serialMap(frozen.stages.entries(), async ([index, stage]) => {
		progress.beginStage(index);
		await scope.dependencies.installStageCorpusSnapshot(
			stage.directory,
			plan.worktreePath,
			frozen.citations,
		);
		progress.completeSetup();

		return { ...stage, index };
	});
}
async function runPipelineStage(
	execution: PipelineStageExecution,
): Promise<ConfirmationRepResult | undefined> {
	const session = await executePipelineStageSession(execution);
	execution.progress.receiveSession(session);
	execution.evidence.recordWorker(session);

	const { scorecard, readManifest } = await judgePipelineStage(
		execution,
		session,
	);
	if (scorecard.grade.verdict === "STOP") {
		return await stopPipelineRep(execution);
	}

	await checkpointPipelineRep(execution, { readManifest, session });

	return undefined;
}
async function runPipelineStages(
	execution: PreparedPipelineRep,
): Promise<ConfirmationRepResult | undefined> {
	for await (const inspection of installedPipelineStages(execution)) {
		const stopped = await runPipelineStage({ ...execution, inspection });
		if (stopped !== undefined) {
			return stopped;
		}
	}

	return undefined;
}
export { runPipelineStages as default };
