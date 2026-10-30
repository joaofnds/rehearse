import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { captureStageCorpusWithoutSkill } from "./checkpoint";
import { stageRubricSha256 } from "./judge-agreement";
import { detachedStageDependencies } from "./replay";
import type { PreparedReplayStage } from "./replay-confirmation-preparation";
import type { ReplayRepContext } from "./replay-confirmation-runtime";
import { recordStageReads } from "./stage-reads";
import {
	executeStageSession,
	stageSessionsWithServices,
} from "./stage-session";
import type {
	StageSessionEnvironment,
	StageSessionResult,
} from "./stage-session-contract";

function replayStageDependencies(
	context: ReplayRepContext,
	prepared: PreparedReplayStage,
): ReturnType<typeof detachedStageDependencies> {
	const {
		dependencies,
		request,
		runtime: { frozen },
	} = context;
	const { environment } = prepared;

	return {
		...detachedStageDependencies(
			stageSessionsWithServices(dependencies.stageSession, environment),
		),
		captureStageCorpus:
			request.stageSkill === "absent"
				? captureStageCorpusWithoutSkill
				: dependencies.stageSession.captureStageCorpus,
		measureCorpus: async () => await Promise.resolve(frozen.corpusVersion),
	};
}
function replayStageEnvironment(
	context: ReplayRepContext,
	prepared: PreparedReplayStage,
): StageSessionEnvironment {
	const {
		request,
		plan,
		spendCeiling,
		runtime: { frozen },
	} = context;
	const { baseSha, baselineHashes, baselineContext } = prepared;

	return {
		baselineContext,
		baselineHashes,
		baselineSha: baseSha,
		commitSubjectPattern: frozen.manifest.pipeline.commitSubjectPattern,
		corpusRoots: [
			{ kind: "directory", root: join(plan.worktreePath, ".claude") },
		],
		effort: request.effort,
		instructions: frozen.instructions,
		model: request.model,
		productBrief: frozen.manifest.productBrief,
		productOwner: prepared.productOwner,
		sessionBudgetUsd: request.sessionBudgetUsd,
		sessionId: randomUUID(),
		settingsOverlay: request.loadedSettings?.json,
		setup: "actual",
		spendCeiling,
		target: frozen.manifest.pipeline.target,
		targetDir: plan.worktreePath,
		task: frozen.manifest.task,
		taskId: frozen.manifest.taskId,
		taskSha: baseSha,
	};
}
async function executeFrozenReplayStage(
	context: ReplayRepContext,
	prepared: PreparedReplayStage,
): Promise<StageSessionResult> {
	return await executeStageSession(
		replayStageDependencies(context, prepared),
		replayStageEnvironment(context, prepared),
		{
			definition: context.runtime.frozen.plan.definition,
			priorArtifacts: prepared.priorArtifacts,
		},
	);
}
async function captureFrozenReplayReads(
	context: ReplayRepContext,
	prepared: PreparedReplayStage,
	session: StageSessionResult,
): Promise<Awaited<ReturnType<typeof recordStageReads>>> {
	const {
		dependencies,
		request,
		plan,
		runtime: { frozen },
	} = context;
	const { baseSha } = prepared;
	return await recordStageReads({
		corpusFiles: session.corpusFiles,
		corpusSources: [],
		rubric: {
			path: frozen.plan.definition.rubric,
			sha256: stageRubricSha256(frozen.rubric.rubric),
		},
		skill:
			request.stageSkill === "absent"
				? undefined
				: frozen.plan.definition.skill,
		startSha: baseSha,
		targetDir: plan.worktreePath,
		transcript:
			dependencies.projectsDirectory === undefined
				? undefined
				: {
						projectsDirectory: dependencies.projectsDirectory,
						sessionId: session.transcript.sessionId,
					},
		versionFiles: session.versionFiles,
	});
}
export { executeFrozenReplayStage, captureFrozenReplayReads };
