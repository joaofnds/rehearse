import { hashArtifacts } from "./checkpoint";
import RunPausedError from "./run-stage-context";
import deliveryEvidence from "./run-stage-delivery-evidence";
import type { StageJudgmentExecution } from "./run-stage-judgment-contract";

const FINAL_PIPELINE_STAGE_OFFSET = -1;

async function recordAcceptedCheckpoint({
	dependencies,
	context,
	history,
	prepared,
}: StageJudgmentExecution): Promise<void> {
	const { observation, stageTranscript, readManifest } = prepared;
	const { session, input, stage, corpusFiles, corpusVersion } = observation;
	history.advanceBaseline(session.resultSha);
	const checkpoint = await dependencies.recordCheckpoint(
		context.targetDir,
		context.checkpointDirectory(stage),
		{
			artifacts: hashArtifacts(input.artifact ? [input.artifact] : []),
			corpusFiles,
			corpusVersion,
			effort: context.effort,
			model: context.model,
			readManifest,
			settingsFile: context.loadedSettings.hashed,
			stage,
			targetSha: session.resultSha,
			transcript: stageTranscript,
			upstream: history.upstream,
		},
	);
	history.keepCheckpoint(checkpoint);
}

async function acceptGradedStage(
	request: StageJudgmentExecution,
): Promise<void> {
	const { dependencies, context, history, prepared } = request;
	const { definition, sessionContext, session, stage } = prepared.observation;
	if (definition.kind === "delivery") {
		const evidence = await deliveryEvidence(
			dependencies,
			sessionContext,
			session,
		);
		history.recordBuildEvidence(evidence);
	}
	await recordAcceptedCheckpoint(request);

	const remaining =
		context.pipeline.stages.at(FINAL_PIPELINE_STAGE_OFFSET) !== definition;

	if (remaining && (await context.pauseRequested?.()) === true) {
		throw new RunPausedError(stage);
	}
}

export { acceptGradedStage as default };
