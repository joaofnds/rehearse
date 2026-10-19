import { relative } from "node:path";

import type { ConfirmationRepResult } from "./confirmation-evidence";
import { collectConfirmationMetrics } from "./confirmation-evidence";
import type { ConfirmationRepRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";
import type { JudgeResult } from "./judge";
import pipelineRepRecord from "./pipeline-rep-record";
import { settleCompletedPipelineRep } from "./pipeline-rep-settlement";
import type {
	PipelineStageExecution,
	PreparedPipelineRep,
} from "./pipeline-rep-state";

const RECORD_JSON_INDENT_SPACES = 2;
function pipelineRepSucceeded(
	metricsStatus: ConfirmationRepRecord["metrics"]["status"],
	stages: Immutable<ConfirmationRepRecord["stages"]>,
	finalVerdict: JudgeResult["grade"]["verdict"],
): boolean {
	return (
		metricsStatus === "COMPLETE" &&
		stages.every(
			(stage) =>
				stage.status === "JUDGED" &&
				stage.verdict === "CONTINUE" &&
				(stage.grade === "A" || stage.grade === "B"),
		) &&
		finalVerdict === "PASS"
	);
}
async function stopPipelineRep({
	scope,
	evidence,
	resources,
	inspection,
}: PipelineStageExecution): Promise<ConfirmationRepResult> {
	const { now } = scope.runtime;

	evidence.stopAfter(inspection);

	const metrics = collectConfirmationMetrics({
		finalJudge: undefined,
		productOwner: resources.productOwner.snapshot().providerCalls,
		stageJudge: evidence.stageJudgeCalls,
		worker: evidence.workerCalls,
	});
	const record = pipelineRepRecord({
		elapsedMs: now() - scope.repStart,
		evidence: metrics,
		finalOutcome: {
			reason: `${inspection.definition.name} Judge stopped the rep`,
			status: "NOT_REACHED",
		},
		plan: scope.context.plan,
		request: scope.context.request,
		stages: evidence.stageOutcomes,
		successful: false,
	});

	return await settleCompletedPipelineRep(
		{
			dependencies: scope.dependencies,
			plan: scope.context.plan,
			repPaths: scope.repPaths,
			request: scope.context.request,
		},
		record,
		evidence.resultSha,
	);
}
async function completePipelineRep(
	{ scope, evidence, resources }: PreparedPipelineRep,
	finalJudge: JudgeResult,
): Promise<ConfirmationRepResult> {
	const { repPaths } = scope;

	await Bun.write(
		repPaths.finalFile,
		`${JSON.stringify(finalJudge, null, RECORD_JSON_INDENT_SPACES)}\n`,
	);

	const metrics = collectConfirmationMetrics({
		finalJudge: finalJudge.attempts,
		productOwner: resources.productOwner.snapshot().providerCalls,
		stageJudge: evidence.stageJudgeCalls,
		worker: evidence.workerCalls,
	});
	const successful = pipelineRepSucceeded(
		metrics.metrics.status,
		evidence.stageOutcomes,
		finalJudge.grade.verdict,
	);
	const record = pipelineRepRecord({
		elapsedMs: scope.runtime.now() - scope.repStart,
		evidence: metrics,
		finalOutcome: {
			evidence: {
				recordFile: relative(repPaths.directory, repPaths.finalFile),
				resultSha: evidence.resultSha,
			},
			status: "JUDGED",
			verdict: finalJudge.grade.verdict,
		},
		plan: scope.context.plan,
		request: scope.context.request,
		stages: evidence.stageOutcomes,
		successful,
	});

	return await settleCompletedPipelineRep(
		{
			dependencies: scope.dependencies,
			plan: scope.context.plan,
			repPaths,
			request: scope.context.request,
		},
		record,
		evidence.resultSha,
	);
}
export { stopPipelineRep, completePipelineRep };
