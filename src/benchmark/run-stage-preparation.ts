import type { PendingStage } from "./run-abort";
import type { StageContext } from "./run-stage-context";
import type { StageRunObservation } from "./run-stage-iteration";
import type { PreparedStageJudgment } from "./run-stage-judgment-contract";
import readStageJudgmentSources from "./run-stage-rubric-reads";
import { stoppingAtCeiling } from "./run-stage-stop-evidence";

interface StageJudgmentPreparation {
	readonly context: StageContext;
	readonly observation: StageRunObservation;
}

async function publishPendingStage({
	context,
	observation,
}: StageJudgmentPreparation): Promise<PendingStage> {
	const { corpusFiles, corpusVersion, input, stage } = observation;

	const stageFile = context.stageFile(stage);

	const pendingStage: PendingStage = {
		corpusFiles,
		corpusVersion,
		effort: context.effort,
		file: stageFile,
		input,
		judgeEffort: context.judgeEffort,
		judgeModel: context.judgeModel,
		model: context.model,
		sessionBudgetUsd: context.sessionBudgetUsd,
		stage,
	};

	await context.writePendingStage(pendingStage);
	return pendingStage;
}

async function prepareStageJudgment(
	request: StageJudgmentPreparation,
): Promise<PreparedStageJudgment> {
	const { context, observation } = request;
	const { session, stage, sessionContext } = observation;
	const pendingStage = await publishPendingStage(request);

	const stageTranscript =
		context.projectsDirectory === undefined
			? undefined
			: {
					projectsDirectory: context.projectsDirectory,
					sessionId: session.transcript.sessionId,
				};

	const startSha = sessionContext.baselineSha;
	const { rubric, readManifest } = await stoppingAtCeiling(
		context,
		stage,
		async () =>
			await readStageJudgmentSources({
				context,
				observation,
				stageTranscript,
				startSha,
			}),
	);

	const readStage: PendingStage = { ...pendingStage, readManifest };

	context.updatePendingStage(readStage);
	return { observation, readManifest, readStage, rubric, stageTranscript };
}

export { prepareStageJudgment as default };
