import type { StageScorecard } from "./contracts";
import { stageRubricSha256 } from "./judge-agreement";
import type { LoadedStageRubric } from "./pipeline-confirmation-request";
import type { PipelineStageExecution } from "./pipeline-rep-state";
import type { ReadManifestEntry } from "./read-manifest";
import { recordStageReads } from "./stage-reads";
import type { StageSessionResult } from "./stage-session-contract";

interface PipelineStageReadEvidence {
	readonly rubric: LoadedStageRubric;
	readonly readManifest: readonly ReadManifestEntry[];
}
interface PipelineStageJudgment {
	readonly scorecard: StageScorecard;
	readonly readManifest: readonly ReadManifestEntry[];
}
async function readPipelineStage(
	{ scope, inspection, evidence }: PipelineStageExecution,
	session: StageSessionResult,
): Promise<PipelineStageReadEvidence> {
	const { dependencies, context } = scope;
	const { request, frozen, plan } = context;
	const { definition } = inspection;
	const rubric = request.stageRubrics[definition.name];
	if (rubric === undefined) {
		throw new Error(`No frozen rubric for ${definition.name}`);
	}

	const readManifest = await recordStageReads({
		corpusFiles: inspection.files,
		corpusSources: [],
		rubric: {
			path: definition.rubric,
			sha256: stageRubricSha256(rubric.rubric),
		},
		skill: definition.skill,
		startSha: evidence.baselineSha,
		targetDir: plan.worktreePath,
		transcript:
			dependencies.projectsDirectory === undefined
				? undefined
				: {
						projectsDirectory: dependencies.projectsDirectory,
						sessionId: session.transcript.sessionId,
					},
		versionFiles: frozen.versionFiles,
	});

	return { readManifest, rubric };
}
async function judgePipelineStage(
	execution: PipelineStageExecution,
	session: StageSessionResult,
): Promise<PipelineStageJudgment> {
	const { scope, progress, evidence, inspection } = execution;
	const { request } = scope.context;
	const { rubric, readManifest } = await readPipelineStage(execution, session);

	progress.beginStageJudgment(readManifest);
	const scorecard = await scope.dependencies.runStageJudge(
		{
			budget: {
				sessionBudgetUsd: request.sessionBudgetUsd,
				spendCeiling: scope.runtime.spendCeiling,
			},
			effort: request.judgeEffort,
			model: request.judgeModel,
		},
		{ input: session.input, source: rubric },
	);

	progress.stageJudged();
	evidence.recordJudge(scorecard);

	await evidence.recordStage({
		clock: progress.stageClock,
		inspection,
		readManifest,
		scorecard,
		session,
	});

	return { readManifest, scorecard };
}
export { judgePipelineStage as default };
