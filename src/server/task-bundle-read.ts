import type { PipelineCaseDeclaration } from "#benchmark/case";
import { HTTP_STATUS_CONFLICT } from "#server/http-status";
import { pipelineCase, refusingAs } from "#server/pipeline-steps";
import { TASK_BUNDLE_FORMAT } from "#server/task-bundle-contract";
import type { ValidatedTaskBundle } from "#server/task-bundle-contract";
import { bundleDocuments } from "#server/task-bundle-documents";
import bundledPipeline from "#server/task-bundle-pipeline";

interface TaskBundleReadRequest {
	readonly casesRoot: string;
	readonly caseId: string;
}

async function readCaseBundle(
	casesRoot: string,
	declaration: PipelineCaseDeclaration,
): Promise<ValidatedTaskBundle> {
	const caseId = declaration.id;
	const written = await bundledPipeline(casesRoot, declaration);
	const { task, productBrief, finalRubric, rubrics, stageSettings } =
		await bundleDocuments(casesRoot, declaration);

	return {
		caseId,
		finalRubric,
		format: TASK_BUNDLE_FORMAT,
		model: declaration.model,
		pipeline: written,
		productBrief,
		rubrics,
		sessionBudgetUsd: declaration.sessionBudgetUsd,
		stageSettings,
		target: { path: declaration.target.path },
		task,
		title: declaration.title,
		version: 1,
	};
}

/** Reads a pipeline case into a bundle, refusing one the harness would refuse to run. */
async function readTaskBundle({
	casesRoot,
	caseId,
}: TaskBundleReadRequest): Promise<ValidatedTaskBundle> {
	const declaration = await pipelineCase(casesRoot, caseId);

	return await refusingAs(
		HTTP_STATUS_CONFLICT,
		async () => await readCaseBundle(casesRoot, declaration),
	);
}

export { readTaskBundle as default };
