import { CaseDeclarationError, parseCaseDeclaration } from "#benchmark/case";
import type { PipelineCaseDeclaration } from "#benchmark/case";
import type { Immutable } from "#benchmark/contracts";
import { HTTP_STATUS_BAD_REQUEST } from "#server/http-status";
import { PipelineCaseRefusalError } from "#server/pipeline-steps";
import type { TaskImport } from "#server/task-bundle-contract";

/** The files an imported case is written as, relative to its directory. */
const IMPORTED_FILES = {
	finalRubric: "rubric.md",
	pipeline: "pipeline.json",
	productBrief: "product-brief.md",
	rubrics: "rubrics",
	stageSettings: "stage-settings.json",
	task: "task.md",
} as const;

function importedDeclaration(
	request: Immutable<TaskImport>,
): PipelineCaseDeclaration {
	const { bundle } = request;
	const text = JSON.stringify({
		effort: bundle.effort,
		finalRubric: IMPORTED_FILES.finalRubric,
		id: request.id,
		kind: "pipeline",
		model: bundle.model,
		pipeline: IMPORTED_FILES.pipeline,
		productBrief: IMPORTED_FILES.productBrief,
		rubrics: IMPORTED_FILES.rubrics,
		sessionBudgetUsd: bundle.sessionBudgetUsd,
		settingsFile:
			bundle.stageSettings === undefined
				? undefined
				: IMPORTED_FILES.stageSettings,
		target: { path: request.targetPath },
		task: IMPORTED_FILES.task,
		title: request.title,
	});
	const readBundleDeclaration = (): ReturnType<typeof parseCaseDeclaration> => {
		try {
			return parseCaseDeclaration(request.id, text);
		} catch (error) {
			if (!(error instanceof CaseDeclarationError)) {
				throw error;
			}

			throw new PipelineCaseRefusalError(
				error.message,
				HTTP_STATUS_BAD_REQUEST,
			);
		}
	};

	const declaration = readBundleDeclaration();
	if (declaration.kind !== "pipeline") {
		throw new PipelineCaseRefusalError(
			`Case ${request.id} did not declare as a pipeline case`,
			HTTP_STATUS_BAD_REQUEST,
		);
	}

	return declaration;
}

export { IMPORTED_FILES, importedDeclaration };
