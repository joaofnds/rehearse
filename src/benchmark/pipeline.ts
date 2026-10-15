import { readdir } from "node:fs/promises";
import { join, normalize, relative, resolve } from "node:path";
import { z } from "zod";
import { INITIAL_CHECKPOINT_STAGE } from "./checkpoint";
import { CONTROL_DIR } from "./config";
import { loadStageRubric } from "./stage-grading";
import type { Immutable } from "./contracts";

/**
 * Stage and skill names are interpolated into paths and into the prompt of a
 * session that runs without permission prompts, so both must be a single plain
 * identifier: no separators, no traversal, no whitespace, no newlines.
 */
const identifierSchema = z
	.string()
	.min(1)
	.regex(
		/^[a-z0-9][a-z0-9_-]*$/iu,
		"must be letters, digits, dashes, or underscores",
	);

const stageDefinitionSchema = z.discriminatedUnion("kind", [
	z
		.object({
			name: identifierSchema,
			kind: z.literal("planning"),
			skill: identifierSchema,
			artifact: z.string().min(1).optional(),
			rubric: z.string().min(1),
			requiresAcceptanceCriteria: z.boolean().default(false),
		})
		.strict(),
	z
		.object({
			name: identifierSchema,
			kind: z.literal("delivery"),
			skill: identifierSchema,
			rubric: z.string().min(1),
		})
		.strict(),
]);

/** A pipeline's steps, in the order they run. */
export const pipelineStagesSchema = z.array(stageDefinitionSchema).min(1);

const targetRelativePathSchema = z
	.string()
	.min(1)
	.refine(
		(path) =>
			!/^(?:[\\/]|[a-z]:)/iu.test(path) && !path.split(/[\\/]/u).includes(".."),
		"must be a target-relative path without traversal",
	);

const environmentNameSchema = z
	.string()
	.regex(/^[A-Za-z_][A-Za-z0-9_]*$/u, "must be an environment variable name");

/** An export reaches the stage session too, so it leaves alone what the provider reads. */
const serviceExportNameSchema = environmentNameSchema.refine(
	(name) => name !== "HOME" && !/^(?:ANTHROPIC|CLAUDE)_/u.test(name),
	"must not replace a variable the session's provider reads",
);

const targetCheckSchema = z
	.object({
		command: z.array(z.string().min(1)).min(1),
		env: z.record(environmentNameSchema, z.string()).optional(),
	})
	.strict();

/** Where a service export names the host port the container runtime assigned. */
export const SERVICE_PORT_PLACEHOLDER = "{port}";

const targetServiceSchema = z
	.object({
		name: z.string().min(1),
		image: z.string().min(1),
		port: z.int().min(1).max(65_535),
		env: z.record(environmentNameSchema, z.string()).optional(),
		ready: z.array(z.string().min(1)).min(1),
		exports: z
			.record(
				serviceExportNameSchema,
				z
					.string()
					.includes(
						SERVICE_PORT_PLACEHOLDER,
						`must name the service's port as ${SERVICE_PORT_PLACEHOLDER}`,
					),
			)
			.refine(
				(exports) => Object.keys(exports).length > 0,
				"must export at least one variable",
			),
	})
	.strict();

const targetServicesSchema = z
	.array(targetServiceSchema)
	.min(1)
	.refine(
		(services) =>
			new Set(services.map(({ name }) => name)).size === services.length,
		"must name each service once",
	)
	.refine((services) => {
		const variables = services.flatMap(({ exports }) => Object.keys(exports));

		return new Set(variables).size === variables.length;
	}, "must export each variable from one service");

const targetDefinitionSchema = z
	.object({
		services: targetServicesSchema.optional(),
		setup: z.array(targetCheckSchema).min(1).optional(),
		checks: z.array(targetCheckSchema).min(1),
		integrityFiles: z
			.array(targetRelativePathSchema)
			.min(1)
			.refine(
				(paths) =>
					new Set(paths.map((path) => normalize(path))).size === paths.length,
				"must contain unique paths",
			),
	})
	.strict();

export const pipelineDefinitionSchema = z
	.object({
		statuses: z.array(z.string().min(1)).min(1),
		commitSubjectPattern: z
			.string()
			.min(1)
			.refine((pattern) => {
				try {
					return new RegExp(pattern, "u") instanceof RegExp;
				} catch {
					return false;
				}
			}, "must be a valid regular expression")
			.optional(),
		target: targetDefinitionSchema,
		stages: pipelineStagesSchema,
	})
	.strict();

export type StageDefinition = Immutable<z.infer<typeof stageDefinitionSchema>>;
export type StageKind = StageDefinition["kind"];
export type PlanningStageDefinition = Extract<
	StageDefinition,
	{ kind: "planning" }
>;
export type TargetCheck = Immutable<z.infer<typeof targetCheckSchema>>;
export type TargetService = Immutable<z.infer<typeof targetServiceSchema>>;
export type TargetDefinition = Immutable<
	z.infer<typeof targetDefinitionSchema>
>;
export type PipelineDefinition = Immutable<
	z.infer<typeof pipelineDefinitionSchema>
>;

export class PipelineDefinitionError extends Error {
	public override name = "PipelineDefinitionError";
}

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

export function parsePipeline(
	content: string,
	availableRubrics: readonly string[],
): PipelineDefinition {
	let document: unknown;
	try {
		document = JSON.parse(content);
	} catch (error) {
		throw new PipelineDefinitionError(
			`Pipeline definition is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	const parsed = pipelineDefinitionSchema.safeParse(document);
	if (!parsed.success) {
		const [issue] = parsed.error.issues;
		const [head, indexCandidate, ...rest] = issue?.path ?? [];
		const message = issue?.message ?? "invalid definition";

		const index = z.int().safeParse(indexCandidate);
		if (head !== "stages" || !index.success) {
			throw new PipelineDefinitionError(
				`Pipeline definition has an invalid ${String(head ?? "definition")}: ${message}`,
			);
		}

		// The definition already failed full validation; these probes only
		// recover the offending stage's name for the error message, so every
		// invalid part collapses to an absent name instead of failing too.
		const container = z
			.looseObject({ stages: z.array(z.unknown()) })
			.safeParse(document);
		const stage = z
			.looseObject({ name: z.string().min(1) })
			.safeParse(
				container.success ? container.data.stages[index.data] : undefined,
			);
		const stageName = stage.success ? stage.data.name : undefined;
		const field = rest.length > 0 ? rest.join(".") : "definition";

		throw new PipelineDefinitionError(
			`Pipeline ${stageLabel(stageName, index.data)} has an invalid ${field}: ${message}`,
		);
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
	if (deliveryStages.length > 1) {
		throw new PipelineDefinitionError(
			`Pipeline must declare exactly one delivery stage; it declares ${deliveryStages.map(({ name }) => name).join(", ")}`,
		);
	}
	if (stages.at(-1) !== delivery) {
		throw new PipelineDefinitionError(
			`Pipeline delivery stage ${delivery.name} must be last`,
		);
	}
}

export async function loadPipeline(
	pipelinePath: string,
	rubricsPath: string,
): Promise<PipelineDefinition> {
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
	for (const stage of pipeline.stages) {
		try {
			await loadStageRubric(stage);
		} catch (error) {
			throw new PipelineDefinitionError(
				`Pipeline stage ${stage.name} names a rubric it cannot use: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
}
