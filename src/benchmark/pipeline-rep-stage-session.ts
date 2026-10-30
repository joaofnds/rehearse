import { randomUUID } from "node:crypto";
import { join } from "node:path";

import type { PipelineStageExecution } from "./pipeline-rep-state";
import { measuredStageDependencies } from "./pipeline-stage-clock";
import {
	executeStageSession,
	stageSessionsWithServices,
} from "./stage-session";
import type { StageSessionResult } from "./stage-session-contract";
import type { StageSessionDependencies } from "./stage-session-dependencies";

function frozenStageDependencies({
	scope,
	progress,
	resources,
}: PipelineStageExecution): StageSessionDependencies {
	const { frozen } = scope.context;
	return {
		...measuredStageDependencies(
			stageSessionsWithServices(
				scope.dependencies.stageSession,
				resources.environment,
			),
			progress.stageClock,
		),
		corpusVersionFiles: async () => await Promise.resolve(frozen.versionFiles),
		measureCorpus: async () => await Promise.resolve(frozen.corpusVersion),
	};
}
async function executePipelineStageSession(
	execution: PipelineStageExecution,
): Promise<StageSessionResult> {
	const { scope, evidence, resources, inspection } = execution;
	const { request, frozen, plan } = scope.context;

	return await executeStageSession(
		frozenStageDependencies(execution),
		{
			baselineContext: frozen.baselineContext,
			baselineHashes: frozen.baselineHashes,
			baselineSha: evidence.baselineSha,
			commitSubjectPattern: request.pipeline.commitSubjectPattern,
			corpusRoots: [
				{ kind: "directory", root: join(plan.worktreePath, ".claude") },
			],
			effort: request.effort,
			instructions: request.instructions,
			model: request.model,
			productBrief: request.productBrief,
			productOwner: resources.productOwner,
			sessionBudgetUsd: request.sessionBudgetUsd,
			sessionId: randomUUID(),
			settingsOverlay: request.loadedSettings?.json,
			setup: "actual",
			spendCeiling: scope.runtime.spendCeiling,
			target: request.pipeline.target,
			targetDir: plan.worktreePath,
			task: request.task,
			taskId: frozen.taskId,
			taskSha: frozen.taskSha,
		},
		{
			definition: inspection.definition,
			priorArtifacts: evidence.priorArtifacts,
		},
	);
}
export { executePipelineStageSession as default };
