import { randomUUID } from "node:crypto";

import type { StageDefinition } from "./pipeline";
import type { StageContext } from "./run-stage-context";
import type { StageRunHistory } from "./run-stage-history";
import type {
	StageIterationRequest,
	StageRunObservation,
} from "./run-stage-iteration";
import { stoppingAtCeiling } from "./run-stage-stop-evidence";
import { executeStageSession } from "./stage-session";

const FALLBACK_STAGE_START_EPOCH_MS = 0;

const NO_SPEND_USD = 0;
interface StageStartNotification {
	readonly context: StageContext;
	readonly history: StageRunHistory;
	readonly definition: StageDefinition;
}
interface StageStartedEvent {
	readonly stage: string;
	readonly stageStartedAtMs: number | undefined;
	readonly sessionId: string;
}
function announceStage({
	context,
	history,
	definition,
}: StageStartNotification): StageStartedEvent {
	const stage = definition.name;

	const stageStartedAtMs = context.elapsedMs?.();

	const sessionId = randomUUID();

	context.runEvents?.recordStageStarted(
		stage,
		{
			elapsedMs: stageStartedAtMs ?? FALLBACK_STAGE_START_EPOCH_MS,
			spentUsd: history.workflow.reduce(
				(total, transcript) => total + transcript.costUsd,
				NO_SPEND_USD,
			),
		},
		sessionId,
	);
	return { sessionId, stage, stageStartedAtMs };
}

async function beginGradedStage(
	request: StageIterationRequest,
): Promise<StageRunObservation> {
	const { context, history, dependencies, corpusRoots, definition } = request;
	const { stage, stageStartedAtMs, sessionId } = announceStage(request);

	const sessionContext = {
		...context,
		baselineSha: history.baselineSha,
		commitSubjectPattern: context.pipeline.commitSubjectPattern,
		corpusRoots,
		sessionId,
		settingsOverlay: context.loadedSettings.json,
		target: context.pipeline.target,
	};

	const session = await stoppingAtCeiling(
		context,
		stage,
		async () =>
			await executeStageSession(dependencies, sessionContext, {
				definition,
				priorArtifacts: history.artifacts,
			}),
	);

	const { corpusFiles, corpusVersion, versionFiles, input } = session;

	history.appendSession(session);

	return {
		corpusFiles,
		corpusVersion,
		definition,
		input,
		session,
		sessionContext,
		stage,
		stageStartedAtMs,
		versionFiles,
	};
}

export { beginGradedStage as default };
