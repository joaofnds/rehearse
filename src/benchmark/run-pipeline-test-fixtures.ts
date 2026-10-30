import { parseArgs } from "./config";
import type { PipelineDefinition, PlanningStageDefinition } from "./pipeline";
import { loadPipeline } from "./pipeline";
import {
	AUDIT_LOG_PIPELINE_PATH,
	AUDIT_LOG_RUBRICS_PATH,
} from "./test-support";

function planningStage(
	name: string,
	artifact: string,
	rubric: string,
): PlanningStageDefinition {
	return {
		artifact,
		kind: "planning" as const,
		name,
		requiresAcceptanceCriteria: false,
		rubric,
		skill: name,
	};
}

const asConfigured = (pipelineArgument: string): string =>
	parseArgs(
		[
			"--target",
			"/tmp/target",
			"--model",
			"sonnet",
			"--effort",
			"medium",
			"--session-budget-usd",
			"5",
			"--pipeline",
			pipelineArgument,
		],
		{},
		{
			caseId: "audit-log",
			pipelinePath: AUDIT_LOG_PIPELINE_PATH,
			targetPath: "/tmp/target",
		},
	).pipelinePath;

async function loadDefaultPipeline(): Promise<PipelineDefinition> {
	return await loadPipeline(AUDIT_LOG_PIPELINE_PATH, AUDIT_LOG_RUBRICS_PATH);
}
export { planningStage, asConfigured, loadDefaultPipeline };
