import { basename } from "node:path";

import type { PipelineCaseDeclaration } from "#benchmark/case";
import { readDeclaredPipeline } from "#server/pipeline-definition";
import { writtenPipelineSchema } from "#server/task-bundle-contract";
import type { ValidatedTaskBundle } from "#server/task-bundle-contract";
import { declaredText } from "#server/task-bundle-documents";

/** Validates the case before retaining its written pipeline without parser defaults. */
async function bundledPipeline(
	casesRoot: string,
	declaration: PipelineCaseDeclaration,
): Promise<ValidatedTaskBundle["pipeline"]> {
	const definition = await readDeclaredPipeline(casesRoot, declaration);
	const written = writtenPipelineSchema.parse(
		JSON.parse(
			await declaredText(casesRoot, declaration, {
				field: "pipeline",
				path: declaration.pipeline,
			}),
		),
	);
	// Parsing owns these objects; naming each rubric by file name changes no case input.
	for (const stage of written.stages) {
		stage.rubric = basename(stage.rubric);
	}

	return {
		definition: {
			...definition,
			stages: definition.stages.map((stage) =>
				stage.kind === "planning"
					? {
							artifact: stage.artifact,
							kind: stage.kind,
							name: stage.name,
							requiresAcceptanceCriteria: stage.requiresAcceptanceCriteria,
							rubric: basename(stage.rubric),
							skill: stage.skill,
						}
					: {
							kind: stage.kind,
							name: stage.name,
							rubric: basename(stage.rubric),
							skill: stage.skill,
						},
			),
		},
		written,
	};
}

export { bundledPipeline as default };
