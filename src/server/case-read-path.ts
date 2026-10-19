import { realpath } from "node:fs/promises";
import { join, sep } from "node:path";

import { caseRelative } from "#benchmark/case";
import type { PipelineCaseDeclaration } from "#benchmark/case";
import { PipelineDefinitionError } from "#benchmark/pipeline";

interface CaseReadReference {
	readonly casesRoot: string;
	readonly declaration: PipelineCaseDeclaration;
	readonly path: string;
}

async function existingRealPath(path: string): Promise<string | undefined> {
	try {
		return await realpath(path);
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return undefined;
		}

		throw error;
	}
}

/** Resolves links before a case input is opened, retaining each reader's missing-file diagnostic. */
async function caseReadPath({
	casesRoot,
	declaration,
	path,
}: CaseReadReference): Promise<string> {
	const lexical = caseRelative(declaration, path, casesRoot);
	const directory = await realpath(join(casesRoot, declaration.id));
	const destination = await existingRealPath(lexical);
	if (destination === undefined) {
		return lexical;
	}

	if (!destination.startsWith(`${directory}${sep}`)) {
		throw new PipelineDefinitionError(
			`Case ${declaration.id} names a path outside its case directory: ${path}`,
		);
	}

	return destination;
}

export { caseReadPath as default };
