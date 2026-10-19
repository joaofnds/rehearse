import { basename, join } from "node:path";

import { caseRelative } from "#benchmark/case";
import type { PipelineCaseDeclaration } from "#benchmark/case";
import { PipelineDefinitionError, parsePipeline } from "#benchmark/pipeline";
import type { PipelineDefinition } from "#benchmark/pipeline";
import { parseStageRubric } from "#benchmark/stage-rubric";
import caseReadPath from "#server/case-read-path";
import caseRubrics from "#server/pipelines-case-rubrics";

/**
 * A case's pipeline text through the harness's own parse and rubric fit, so
 * text the harness would refuse to run throws rather than reads.
 */
async function checkedPipeline(
	casesRoot: string,
	declaration: PipelineCaseDeclaration,
	text: string,
): Promise<PipelineDefinition> {
	const pipeline = parsePipeline(
		text,
		await caseRubrics(casesRoot, declaration),
	);
	await Array.fromAsync(pipeline.stages, async (stage) => {
		const rubricPath = join(declaration.rubrics, basename(stage.rubric));
		try {
			const rubric = Bun.file(
				await caseReadPath({ casesRoot, declaration, path: rubricPath }),
			);
			parseStageRubric(await rubric.text(), stage.kind);
		} catch (error) {
			if (error instanceof PipelineDefinitionError) {
				throw error;
			}

			throw new PipelineDefinitionError(
				`Pipeline stage ${stage.name} names a rubric it cannot use: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	});

	return pipeline;
}

/** The file a case's pipeline is declared in. */
function declaredPipelineFile(
	casesRoot: string,
	declaration: PipelineCaseDeclaration,
): string {
	return caseRelative(declaration, declaration.pipeline, casesRoot);
}

/**
 * A case's declared pipeline, read from its file through `checkedPipeline`,
 * and a path outside the case directory throws before anything opens it.
 */
async function readDeclaredPipeline(
	casesRoot: string,
	declaration: PipelineCaseDeclaration,
): Promise<PipelineDefinition> {
	const file = Bun.file(declaredPipelineFile(casesRoot, declaration));
	if (!(await file.exists())) {
		throw new PipelineDefinitionError(
			`Pipeline definition not found: ${declaration.pipeline}`,
		);
	}

	const readPipelineText = async (): Promise<string> => {
		try {
			const path = await caseReadPath({
				casesRoot,
				declaration,
				path: declaration.pipeline,
			});
			return await Bun.file(path).text();
		} catch (error) {
			if (error instanceof PipelineDefinitionError) {
				throw error;
			}

			throw new PipelineDefinitionError(
				`Pipeline definition cannot be read: ${declaration.pipeline}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	};

	const text = await readPipelineText();

	const pipeline = await checkedPipeline(casesRoot, declaration, text);

	return pipeline;
}

export { checkedPipeline, declaredPipelineFile, readDeclaredPipeline };
