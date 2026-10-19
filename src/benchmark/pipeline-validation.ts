import { z } from "zod";

import { INITIAL_CHECKPOINT_STAGE } from "./checkpoint";
import type { Immutable } from "./contracts";
import parseJsonDocument from "./json-document";
import {
	PipelineDefinitionError,
	pipelineDefinitionSchema,
	pipelineValidationOrder,
} from "./pipeline-schema";
import type { PipelineDefinition, StageDefinition } from "./pipeline-schema";
import orderedValidationIssues from "./validation-issue-order";

const FINAL_PIPELINE_STAGE_OFFSET = -1;
const SINGLE_ITEM_COUNT = 1;
const EMPTY_COLLECTION_LENGTH = 0;
/**
 * Names the harness has already given to something of its own. "final" marks a
 * human-review finding against the final Judge, which grades the whole
 * candidate rather than any one stage. "review" is the human-review file's
 * suffix in the run directory, which a stage of that name would overwrite.
 * The initial checkpoint's name would collide with a stage's checkpoint
 * directory.
 */
const RESERVED_STAGE_NAMES: readonly string[] = [
	"final",
	"review",
	INITIAL_CHECKPOINT_STAGE,
];

function stageLabel(name: string | undefined, index: number): string {
	return name === undefined ? `stage at index ${index}` : `stage ${name}`;
}

type PipelineDocument = Extract<
	ReturnType<
		typeof parseJsonDocument<z.infer<typeof pipelineDefinitionSchema>>
	>,
	{ kind: "parsed" }
>;

function pipelineDocument(content: string): PipelineDocument {
	const reading = parseJsonDocument(content, pipelineDefinitionSchema);
	if (reading.kind === "invalid-json") {
		const { error } = reading;
		throw new PipelineDefinitionError(
			`Pipeline definition is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	return reading;
}

/** Invalid definitions still name a stage when its name can be recovered. */
function offendingStageName(
	document: Pick<PipelineDocument, "value">,
	index: number,
): string | undefined {
	const container = z
		.looseObject({ stages: z.array(z.unknown()) })
		.safeParse(document.value);
	const stage = z
		.looseObject({ name: z.string().nonempty() })
		.safeParse(container.success ? container.data.stages[index] : undefined);

	return stage.success ? stage.data.name : undefined;
}

function invalidPipeline(
	error: Immutable<Pick<z.ZodError, "issues">>,
	document: Pick<PipelineDocument, "value">,
): never {
	const [issue] = orderedValidationIssues({
		error,
		order: pipelineValidationOrder,
	});
	const [head, indexCandidate, ...rest] = issue?.path ?? [];
	const message = issue?.message ?? "invalid definition";
	const index = z.int().safeParse(indexCandidate);
	if (head !== "stages" || !index.success) {
		throw new PipelineDefinitionError(
			`Pipeline definition has an invalid ${String(head ?? "definition")}: ${message}`,
		);
	}

	const stageName = offendingStageName(document, index.data);
	const field =
		rest.length > EMPTY_COLLECTION_LENGTH ? rest.join(".") : "definition";

	throw new PipelineDefinitionError(
		`Pipeline ${stageLabel(stageName, index.data)} has an invalid ${field}: ${message}`,
	);
}

function parsePipeline(
	content: string,
	availableRubrics: readonly string[],
): PipelineDefinition {
	const document = pipelineDocument(content);
	const { parsed } = document;
	if (!parsed.success) {
		invalidPipeline(parsed.error, document);
	}

	assertUniqueNames(parsed.data.stages);
	assertRubricsExist(parsed.data.stages, availableRubrics);
	assertOneDeliveryStageLast(parsed.data.stages);

	return parsed.data;
}

function assertUniqueNames(stages: readonly StageDefinition[]): void {
	const seen = new Set<string>();

	for (const stage of stages) {
		if (RESERVED_STAGE_NAMES.includes(stage.name)) {
			throw new PipelineDefinitionError(
				`Pipeline stage ${stage.name} has a reserved name; ${RESERVED_STAGE_NAMES.join(", ")} cannot name a stage`,
			);
		}

		if (seen.has(stage.name)) {
			throw new PipelineDefinitionError(
				`Pipeline stage ${stage.name} has a duplicate name; every stage name must be unique`,
			);
		}

		seen.add(stage.name);
	}
}

function assertRubricsExist(
	stages: readonly StageDefinition[],
	availableRubrics: readonly string[],
): void {
	for (const stage of stages) {
		if (!availableRubrics.includes(stage.rubric)) {
			throw new PipelineDefinitionError(
				`Pipeline stage ${stage.name} names a missing rubric: ${stage.rubric}`,
			);
		}
	}
}

function assertOneDeliveryStageLast(stages: readonly StageDefinition[]): void {
	const deliveryStages = stages.filter(({ kind }) => kind === "delivery");
	const [delivery] = deliveryStages;

	if (!delivery) {
		throw new PipelineDefinitionError(
			"Pipeline must declare exactly one delivery stage; it declares none",
		);
	}

	if (deliveryStages.length > SINGLE_ITEM_COUNT) {
		throw new PipelineDefinitionError(
			`Pipeline must declare exactly one delivery stage; it declares ${deliveryStages.map(({ name }) => name).join(", ")}`,
		);
	}

	if (stages.at(FINAL_PIPELINE_STAGE_OFFSET) !== delivery) {
		throw new PipelineDefinitionError(
			`Pipeline delivery stage ${delivery.name} must be last`,
		);
	}
}

export { parsePipeline as default };
