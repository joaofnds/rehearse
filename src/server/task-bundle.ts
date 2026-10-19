import { dirname, join } from "node:path";

import { CASES_DIRECTORY, caseDeclarationPath } from "#benchmark/case";
import type { Immutable } from "#benchmark/contracts";
import writeImportedCase from "#server/task-bundle-case-write";
import type {
	ImportedTask,
	PipelineCaseRequest,
	TaskImport,
} from "#server/task-bundle-contract";
import { importedDeclaration } from "#server/task-bundle-declaration";
import readTaskBundle from "#server/task-bundle-read";
import refuseTarget from "#server/task-bundle-refuse-target";
import refuseStageSettings from "#server/task-bundle-stage-settings";

/**
 * Declares a new pipeline case from a bundle. Everything a run reads is
 * checked before the case directory is claimed, except the pipeline, whose
 * rubrics must be on disk to be checked, so a pipeline the harness refuses
 * removes the directory it was written into.
 */
async function importTaskBundle(
	casesRoot: string,
	request: Immutable<TaskImport>,
): Promise<ImportedTask> {
	const declaration = importedDeclaration(request);
	const caseDirectory = dirname(caseDeclarationPath(request.id, casesRoot));
	await refuseTarget(caseDirectory, request.targetPath);
	refuseStageSettings(request.bundle.stageSettings);

	await writeImportedCase({ casesRoot, declaration, request });

	return {
		caseId: request.id,
		path: join(CASES_DIRECTORY, request.id),
	};
}

async function declarePipelineCase(
	casesRoot: string,
	request: Immutable<PipelineCaseRequest>,
): Promise<ImportedTask> {
	const bundle = await readTaskBundle({ caseId: request.from, casesRoot });

	return await importTaskBundle(casesRoot, {
		bundle: {
			...bundle,
			productBrief: request.productBrief,
			task: request.task,
		},
		id: request.id,
		targetPath: request.targetPath,
		title: request.title,
	});
}

export { importTaskBundle, declarePipelineCase };

export {
	TASK_BUNDLE_FORMAT,
	taskBundleSchema,
	taskBundleValidationOrder,
} from "#server/task-bundle-contract";
export { default as exportTaskBundle } from "#server/task-bundle-export-task-bundle";
export { default as previewTaskBundle } from "#server/task-bundle-preview-task-bundle";
export type {
	TaskBundle,
	PreviewedStep,
	PreviewedService,
	TaskBundlePreview,
	TaskImport,
	ImportedTask,
	PipelineCaseRequest,
} from "#server/task-bundle-contract";
