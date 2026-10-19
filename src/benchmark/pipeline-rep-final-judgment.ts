import type { JudgeResult } from "./judge";
import type { PreparedPipelineRep } from "./pipeline-rep-state";

async function judgePipelineRepCandidate({
	scope,
	progress,
	evidence,
}: PreparedPipelineRep): Promise<JudgeResult> {
	const { dependencies, context, runtime } = scope;
	const { request, frozen, plan } = context;
	const { buildEvidence } = evidence;
	if (buildEvidence === undefined) {
		throw new Error("Build stage did not run");
	}

	const fullCandidate = await dependencies.captureBuildCandidate(
		plan.worktreePath,
		frozen.taskSha,
	);

	progress.beginFinalJudgment();
	return await dependencies.runFinalJudge({
		baselineContext: frozen.baselineContext,
		evidence: {
			...buildEvidence,
			changedPaths: fullCandidate.changedPaths,
			diff: fullCandidate.diff,
		},
		ordinal: plan.ordinal,
		repId: plan.repId,
		resultSha: evidence.resultSha,
		rubric: request.finalRubric,
		spendCeiling: runtime.spendCeiling,
	});
}
export { judgePipelineRepCandidate as default };
