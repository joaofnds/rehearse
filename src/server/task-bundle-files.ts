import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { caseDeclarationPath, caseRelative } from "#benchmark/case";
import type { PipelineCaseDeclaration } from "#benchmark/case";
import { CONTROL_DIR } from "#benchmark/config";
import type { Immutable } from "#benchmark/contracts";
import projectFormatted from "#benchmark/project-format";
import type { ValidatedTaskBundle } from "#server/task-bundle-contract";
import { IMPORTED_FILES } from "#server/task-bundle-declaration";

async function writeFormatted(file: string, text: string): Promise<void> {
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, await projectFormatted(file, text));
}

async function writeBundleDocuments(
	directory: string,
	bundle: Immutable<ValidatedTaskBundle>,
): Promise<void> {
	const at = (path: string): string => join(directory, path);

	await writeFormatted(at(IMPORTED_FILES.task), bundle.task);
	await writeFormatted(at(IMPORTED_FILES.productBrief), bundle.productBrief);
	await writeFormatted(at(IMPORTED_FILES.finalRubric), bundle.finalRubric);
	await Array.fromAsync(
		Object.entries(bundle.rubrics),
		async ([name, rubric]) => {
			await writeFormatted(at(join(IMPORTED_FILES.rubrics, name)), rubric);
		},
	);
	if (bundle.stageSettings !== undefined) {
		await writeFormatted(
			at(IMPORTED_FILES.stageSettings),
			bundle.stageSettings,
		);
	}
}

async function writeImportedFiles(
	casesRoot: string,
	declaration: PipelineCaseDeclaration,
	bundle: Immutable<ValidatedTaskBundle>,
): Promise<string> {
	const directory = dirname(caseDeclarationPath(declaration.id, casesRoot));

	const written = {
		...bundle.pipeline.written,
		stages: bundle.pipeline.written.stages.map((stage) => ({
			...stage,
			rubric: relative(
				CONTROL_DIR,
				caseRelative(declaration, join(IMPORTED_FILES.rubrics, stage.rubric)),
			),
		})),
	};
	const pipelineText = JSON.stringify(written, null, "\t");

	await writeFormatted(
		caseDeclarationPath(declaration.id, casesRoot),
		JSON.stringify(declaration, null, "\t"),
	);
	await writeBundleDocuments(directory, bundle);
	await writeFormatted(join(directory, IMPORTED_FILES.pipeline), pipelineText);

	return directory;
}

async function importedPipelineText(directory: string): Promise<string> {
	const text = await Bun.file(join(directory, IMPORTED_FILES.pipeline)).text();
	return text;
}

export { writeImportedFiles, importedPipelineText };
