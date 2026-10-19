import { readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { CONTROL_DIR } from "./config";
import { PipelineDefinitionError } from "./pipeline-schema";
import type { PipelineDefinition } from "./pipeline-schema";
import parsePipeline from "./pipeline-validation";
import { loadStageRubric } from "./stage-rubric";

async function pipelineFile(
	pipelinePath: string,
): Promise<ReturnType<typeof Bun.file>> {
	const absolutePath = resolve(CONTROL_DIR, pipelinePath);
	if (!absolutePath.startsWith(`${CONTROL_DIR}/`)) {
		throw new PipelineDefinitionError(
			`Pipeline definition is outside the control repository: ${pipelinePath}`,
		);
	}

	const file = Bun.file(absolutePath);

	if (!(await file.exists())) {
		throw new PipelineDefinitionError(
			`Pipeline definition not found: ${pipelinePath}`,
		);
	}

	return file;
}

async function loadPipeline(
	pipelinePath: string,
	rubricsPath: string,
): Promise<PipelineDefinition> {
	const file = await pipelineFile(pipelinePath);
	const rubricsDirectory = resolve(CONTROL_DIR, rubricsPath);
	const rubricEntries = await readdir(rubricsDirectory);
	const availableRubrics = rubricEntries.map((entry) =>
		relative(CONTROL_DIR, join(rubricsDirectory, entry)),
	);

	const pipeline = parsePipeline(await file.text(), availableRubrics);
	await assertRubricsFitTheirStages(pipeline);

	return pipeline;
}

/**
 * A rubric that does not fit its stage's kind would otherwise surface only when
 * that stage's Judge runs, with the target already claimed and the earlier
 * stages already paid for.
 */
async function assertRubricsFitTheirStages(
	pipeline: PipelineDefinition,
): Promise<void> {
	await Array.fromAsync(pipeline.stages, async (stage) => {
		try {
			await loadStageRubric(stage);
		} catch (error) {
			throw new PipelineDefinitionError(
				`Pipeline stage ${stage.name} names a rubric it cannot use: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	});
}

export { loadPipeline };
export {
	pipelineStageValidationOrder,
	pipelineValidationOrder,
	pipelineStagesSchema,
	SERVICE_PORT_PLACEHOLDER,
	pipelineDefinitionSchema,
	PipelineDefinitionError,
} from "./pipeline-schema";
export { default as parsePipeline } from "./pipeline-validation";
export type {
	StageDefinition,
	StageKind,
	PlanningStageDefinition,
	TargetCheck,
	TargetService,
	TargetDefinition,
	PipelineDefinition,
} from "./pipeline-schema";
