import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import type { PipelineCaseDeclaration } from "#benchmark/case";
import caseReadPath from "#server/case-read-path";
import { HTTP_STATUS_CONFLICT } from "#server/http-status";
import { PipelineCaseRefusalError } from "#server/pipeline-steps";
import { RUBRIC_FILE } from "#server/task-bundle-contract";
import type { DeclaredTextReference } from "#server/task-bundle-contract";

async function declaredText(
	casesRoot: string,
	declaration: PipelineCaseDeclaration,
	{ field, path }: DeclaredTextReference,
): Promise<string> {
	const file = Bun.file(await caseReadPath({ casesRoot, declaration, path }));
	if (!(await file.exists())) {
		throw new PipelineCaseRefusalError(
			`Case ${declaration.id} declares ${field} at ${path}, but no file is there`,
			HTTP_STATUS_CONFLICT,
		);
	}

	const text = await file.text();

	return text;
}

async function bundledRubrics(
	casesRoot: string,
	declaration: PipelineCaseDeclaration,
): Promise<Record<string, string>> {
	const directory = await caseReadPath({
		casesRoot,
		declaration,
		path: declaration.rubrics,
	});
	const rubrics: Record<string, string> = {};
	await Array.fromAsync(
		await readdir(directory, { withFileTypes: true }),
		async (entry) => {
			if (
				(entry.isFile() || entry.isSymbolicLink()) &&
				RUBRIC_FILE.test(entry.name)
			) {
				const path = await caseReadPath({
					casesRoot,
					declaration,
					path: join(declaration.rubrics, entry.name),
				});
				const target = await stat(path);

				if (target.isFile()) {
					rubrics[entry.name] = await Bun.file(path).text();
				}
			}
		},
	);

	return rubrics;
}

async function bundleDocuments(
	casesRoot: string,
	declaration: PipelineCaseDeclaration,
): Promise<BundleDocuments> {
	const task = await declaredText(casesRoot, declaration, {
		field: "task",
		path: declaration.task,
	});
	const productBrief = await declaredText(casesRoot, declaration, {
		field: "productBrief",
		path: declaration.productBrief,
	});
	const finalRubric = await declaredText(casesRoot, declaration, {
		field: "finalRubric",
		path: declaration.finalRubric,
	});
	const rubrics = await bundledRubrics(casesRoot, declaration);
	const stageSettings =
		declaration.settingsFile === undefined
			? undefined
			: await declaredText(casesRoot, declaration, {
					field: "settingsFile",
					path: declaration.settingsFile,
				});

	return { finalRubric, productBrief, rubrics, stageSettings, task };
}

interface BundleDocuments {
	readonly task: string;
	readonly productBrief: string;
	readonly finalRubric: string;
	readonly rubrics: Record<string, string>;
	readonly stageSettings: string | undefined;
}

export { declaredText, bundleDocuments };
