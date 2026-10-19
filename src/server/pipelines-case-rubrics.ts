import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import { CaseDeclarationError, caseRelative } from "#benchmark/case";
import type { PipelineCaseDeclaration } from "#benchmark/case";
import { CONTROL_DIR } from "#benchmark/config";
import { PipelineDefinitionError } from "#benchmark/pipeline";
import caseReadPath from "#server/case-read-path";

/**
 * The rubrics a case's stages may name, control-relative as the stages name
 * them, in file name order.
 */
async function caseRubrics(
	casesRoot: string,
	declaration: PipelineCaseDeclaration,
): Promise<readonly string[]> {
	const readRubricEntries = async (): Promise<readonly string[]> => {
		try {
			const path = await caseReadPath({
				casesRoot,
				declaration,
				path: declaration.rubrics,
			});
			return await readdir(path);
		} catch (error) {
			if (
				error instanceof PipelineDefinitionError ||
				error instanceof CaseDeclarationError
			) {
				throw error;
			}

			throw new PipelineDefinitionError(
				`Rubrics directory cannot be read: ${declaration.rubrics}`,
			);
		}
	};

	const rubricEntries = await readRubricEntries();

	return rubricEntries
		.toSorted((left, right) => left.localeCompare(right))
		.map((entry) =>
			relative(
				CONTROL_DIR,
				caseRelative(declaration, join(declaration.rubrics, entry)),
			),
		);
}

export { caseRubrics as default };
