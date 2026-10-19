import { relative } from "node:path";

import { CaseDeclarationError, caseRelative, listCases } from "#benchmark/case";
import type { PipelineCaseDeclaration } from "#benchmark/case";
import { CONTROL_DIR } from "#benchmark/config";
import type {
	DeclaredCases,
	DeclaredPipeline,
	UnreadablePipelineRecord,
} from "#server/pipelines-contract";
import { redactAbsolutePaths } from "#server/redact-path";

type DeclaredPipelineReading =
	| { readonly kind: "read"; readonly pipeline: DeclaredPipeline }
	| { readonly kind: "unreadable"; readonly problem: UnreadablePipelineRecord };

function declaredPipelineReference(
	declaration: PipelineCaseDeclaration,
): DeclaredPipelineReading {
	try {
		return {
			kind: "read",
			pipeline: {
				declaration,
				path: relative(
					CONTROL_DIR,
					caseRelative(declaration, declaration.pipeline),
				),
			},
		};
	} catch (error) {
		if (!(error instanceof CaseDeclarationError)) {
			throw error;
		}

		return {
			kind: "unreadable",
			problem: {
				id: declaration.id,
				reason: redactAbsolutePaths(error.message),
			},
		};
	}
}

async function declaredPipelines(casesRoot: string): Promise<DeclaredCases> {
	const listing = await listCases(casesRoot, { includeArchived: false });
	const declarations = listing.declarations.filter(
		(declaration) => declaration.kind === "pipeline",
	);
	const readings = declarations.map((declaration) =>
		declaredPipelineReference(declaration),
	);

	return {
		found: readings.flatMap((reading) =>
			reading.kind === "read" ? [reading.pipeline] : [],
		),
		targets: new Map(
			declarations.map((declaration) => [
				declaration.id,
				declaration.target.path,
			]),
		),
		unreadable: [
			...listing.unreadable.map(({ id, reason }) => ({
				id,
				reason: redactAbsolutePaths(reason),
			})),
			...readings.flatMap((reading) =>
				reading.kind === "unreadable" ? [reading.problem] : [],
			),
		],
	};
}

export { declaredPipelines };

export {
	checkedPipeline,
	declaredPipelineFile,
	readDeclaredPipeline,
} from "#server/pipeline-definition";

export { default as caseRubrics } from "#server/pipelines-case-rubrics";
