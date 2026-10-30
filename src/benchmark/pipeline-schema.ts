import { normalize } from "node:path";

import { z } from "zod";

import { isClaudeCodeConfiguration } from "./claude-launch-environment";
import type { Immutable } from "./contracts";
import type { ValidationFieldOrder } from "./validation-issue-order";

const EMPTY_COLLECTION_LENGTH = 0;
const MAXIMUM_TCP_PORT = 65_535;
const MINIMUM_TCP_PORT = 1;

/**
 * Stage and skill names are interpolated into paths and into the prompt of a
 * session that runs without permission prompts, so both must be a single plain
 * identifier: no separators, no traversal, no whitespace, no newlines.
 */
const identifierSchema = z
	.string()
	.nonempty()
	.regex(
		/^[a-z0-9][a-z0-9_-]*$/iu,
		"must be letters, digits, dashes, or underscores",
	);

const stageDefinitionSchema = z.discriminatedUnion("kind", [
	z
		.object({
			artifact: z.string().nonempty().optional(),
			kind: z.literal("planning"),
			name: identifierSchema,
			requiresAcceptanceCriteria: z.boolean().default(false),
			rubric: z.string().nonempty(),
			skill: identifierSchema,
		})
		.strict(),
	z
		.object({
			kind: z.literal("delivery"),
			name: identifierSchema,
			rubric: z.string().nonempty(),
			skill: identifierSchema,
		})
		.strict(),
]);

/** A pipeline's steps, in the order they run. */
const pipelineStagesSchema = z.array(stageDefinitionSchema).nonempty();

const targetRelativePathSchema = z
	.string()
	.nonempty()
	.refine(
		(path) =>
			!/^(?:[\\/]|[a-z]:)/iu.test(path) && !path.split(/[\\/]/u).includes(".."),
		"must be a target-relative path without traversal",
	);

const environmentNameSchema = z
	.string()
	.regex(/^[A-Za-z_][A-Za-z0-9_]*$/u, "must be an environment variable name");

/**
 * An export reaches the stage session too, so it leaves alone what Claude Code
 * reads, which a group records from Rehearse's own environment.
 */
const serviceExportNameSchema = environmentNameSchema.refine(
	(name) => name !== "HOME" && !isClaudeCodeConfiguration(name),
	"must not replace a variable the session's provider reads",
);

const targetCheckSchema = z
	.object({
		command: z.array(z.string().nonempty()).nonempty(),
		env: z.record(environmentNameSchema, z.string()).optional(),
	})
	.strict();

/** Where a service export names the host port the container runtime assigned. */
const SERVICE_PORT_PLACEHOLDER = "{port}";

const targetServiceSchema = z
	.object({
		env: z.record(environmentNameSchema, z.string()).optional(),
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
				(exports) => Object.keys(exports).length > EMPTY_COLLECTION_LENGTH,
				"must export at least one variable",
			),
		image: z.string().nonempty(),
		name: z.string().nonempty(),
		port: z.int().min(MINIMUM_TCP_PORT).max(MAXIMUM_TCP_PORT),
		ready: z.array(z.string().nonempty()).nonempty(),
	})
	.strict();

const targetServicesSchema = z
	.array(targetServiceSchema)
	.nonempty()
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
		checks: z.array(targetCheckSchema).nonempty(),
		integrityFiles: z
			.array(targetRelativePathSchema)
			.nonempty()
			.refine(
				(paths) =>
					new Set(paths.map((path) => normalize(path))).size === paths.length,
				"must contain unique paths",
			),
		services: targetServicesSchema.optional(),
		setup: z.array(targetCheckSchema).nonempty().optional(),
	})
	.strict();

const pipelineDefinitionSchema = z
	.object({
		commitSubjectPattern: z
			.string()
			.nonempty()
			.refine((pattern) => {
				try {
					return new RegExp(pattern, "u") instanceof RegExp;
				} catch {
					return false;
				}
			}, "must be a valid regular expression")
			.optional(),
		stages: pipelineStagesSchema,
		statuses: z.array(z.string().nonempty()).nonempty(),
		target: targetDefinitionSchema,
	})
	.strict();

type StageDefinition = Immutable<z.infer<typeof stageDefinitionSchema>>;
type StageKind = StageDefinition["kind"];
type PlanningStageDefinition = Extract<StageDefinition, { kind: "planning" }>;
type TargetCheck = Immutable<z.infer<typeof targetCheckSchema>>;
type TargetService = Immutable<z.infer<typeof targetServiceSchema>>;
type TargetDefinition = Immutable<z.infer<typeof targetDefinitionSchema>>;
type PipelineDefinition = Immutable<z.infer<typeof pipelineDefinitionSchema>>;

class PipelineDefinitionError extends Error {
	public override name = "PipelineDefinitionError";
}

const pipelineStageValidationOrder: ValidationFieldOrder = {
	fields: [
		"name",
		"kind",
		"skill",
		"artifact",
		"rubric",
		"requiresAcceptanceCriteria",
	],
};

const targetCheckValidationOrder: ValidationFieldOrder = {
	fields: ["command", "env"],
};

const pipelineValidationOrder: ValidationFieldOrder = {
	children: {
		stages: pipelineStageValidationOrder,
		target: {
			children: {
				checks: targetCheckValidationOrder,
				services: {
					fields: ["name", "image", "port", "env", "ready", "exports"],
				},
				setup: targetCheckValidationOrder,
			},
			fields: ["services", "setup", "checks", "integrityFiles"],
		},
	},
	fields: ["statuses", "commitSubjectPattern", "target", "stages"],
};

export {
	pipelineStageValidationOrder,
	pipelineValidationOrder,
	pipelineStagesSchema,
	SERVICE_PORT_PLACEHOLDER,
	pipelineDefinitionSchema,
	PipelineDefinitionError,
};
export type {
	StageDefinition,
	StageKind,
	PlanningStageDefinition,
	TargetCheck,
	TargetService,
	TargetDefinition,
	PipelineDefinition,
};
