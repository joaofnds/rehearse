import { z } from "zod";

import { stageLetterGradeSchema } from "./contracts";

const REQUIRED_TEXT_MINIMUM_CODE_UNITS = 1;

const NO_SESSION_JUDGE_BASELINES = 0;

const MAXIMUM_RATE = 1;

const MINIMUM_RATE = 0;

const MAXIMUM_RATE_DELTA = 1;

const MINIMUM_RATE_DELTA = -1;

const NO_MISSING_METRIC_REPS = 0;

const ELAPSED_RESOURCES_REPORT_SCHEMA_VERSION = 5;

const JUDGE_AGREEMENT_REPORT_SCHEMA_VERSION = 2;

const LEGACY_REPORT_SCHEMA_VERSION = 1;

const MULTIPLE_GROUPS_REPORT_SCHEMA_VERSION = 6;

const RESOURCE_SUMMARIES_REPORT_SCHEMA_VERSION = 4;

const SESSION_REPORT_SCHEMA_VERSION = 3;

const COMPARISON_ARMS = ["baseline", "candidate", "control"] as const;

type ComparisonArm = (typeof COMPARISON_ARMS)[number];

const comparisonArmSchema = z.enum(COMPARISON_ARMS);

const comparisonModeSchema = z.enum(["stage", "pipeline"]);

const identitySchema = z
	.string()
	.regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u, "Invalid comparison identity");

const sha256Schema = z
	.string()
	.regex(/^[0-9a-f]{64}$/u, "Invalid SHA-256 digest");

const digestedPathSchema = z
	.object({ path: z.string().nonempty(), sha256: sha256Schema })
	.strict();

const sourceRepSchema = digestedPathSchema
	.extend({
		attempt: digestedPathSchema.optional(),
		ordinal: z.number().int().positive(),
		repId: identitySchema,
	})
	.strict();

const sessionSourceRepSchema = digestedPathSchema
	.extend({
		attempt: digestedPathSchema,
		ordinal: z.number().int().positive(),
		repId: identitySchema,
	})
	.strict();

const judgedRepOutcomeSchema = z
	.object({
		grade: z.union([stageLetterGradeSchema, z.enum(["PASS", "FAIL"])]),
		name: z.string().nonempty(),
		status: z.literal("JUDGED"),
		successful: z.boolean(),
	})
	.strict();

const unjudgedRepOutcomeSchema = z
	.object({
		name: z.string().nonempty(),
		status: z.enum(["EXECUTION_FAILED", "METRICS_MISSING", "NOT_REACHED"]),
		successful: z.literal(false),
	})
	.strict();

const repOutcomeSchema = z.union([
	judgedRepOutcomeSchema,
	unjudgedRepOutcomeSchema,
]);

const failedCheckSchema = z
	.object({
		detail: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
		index: z.number().int().nonnegative(),
		kind: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
	})
	.strict();

const failedChecksSchema = z.array(failedCheckSchema);

const repCheckScoreSchema = z
	.object({
		declared: z.number().int().nonnegative(),
		failing: failedChecksSchema,
		passed: z.number().int().nonnegative(),
	})
	.strict();

const failedStateResultSchema = z
	.object({
		detail: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
		name: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
	})
	.strict();

const repStateScoreSchema = z
	.object({
		declared: z.number().int().nonnegative(),
		failing: z.array(failedStateResultSchema),
		passed: z.number().int().nonnegative(),
	})
	.strict();

const repWordsSchema = z.discriminatedUnion("state", [
	z
		.object({
			state: z.literal("available"),
			words: z.number().int().nonnegative(),
		})
		.strict(),
	z
		.object({ reason: z.string().nonempty(), state: z.literal("unavailable") })
		.strict(),
]);

const recordedStageBlockerSchema = z
	.object({
		fired: z.boolean(),
		id: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
	})
	.strict();

const recordedStageDimensionSchema = z
	.object({
		grade: stageLetterGradeSchema,
		id: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
	})
	.strict();

const repStageGradingSchema = z
	.object({
		dimensions: z.array(recordedStageDimensionSchema),
		hardBlockers: z.array(recordedStageBlockerSchema),
		scorecard: digestedPathSchema,
		stage: z.string().nonempty(),
	})
	.strict();

const currentSourceRepSchema = sourceRepSchema
	.extend({
		checks: repCheckScoreSchema.optional(),
		outcomes: z.array(repOutcomeSchema).nonempty(),
		stageGrading: z.array(repStageGradingSchema).optional(),
		stateResults: repStateScoreSchema.optional(),
		words: repWordsSchema.optional(),
	})
	.strict();

const currentSessionSourceRepSchema = sessionSourceRepSchema
	.extend({
		checks: repCheckScoreSchema.optional(),
		outcomes: z.array(repOutcomeSchema).nonempty(),
		stateResults: repStateScoreSchema.optional(),
		words: repWordsSchema.optional(),
	})
	.strict();

export {
	COMPARISON_ARMS,
	comparisonArmSchema,
	comparisonModeSchema,
	currentSessionSourceRepSchema,
	currentSourceRepSchema,
	digestedPathSchema,
	ELAPSED_RESOURCES_REPORT_SCHEMA_VERSION,
	identitySchema,
	JUDGE_AGREEMENT_REPORT_SCHEMA_VERSION,
	LEGACY_REPORT_SCHEMA_VERSION,
	MAXIMUM_RATE,
	MAXIMUM_RATE_DELTA,
	MINIMUM_RATE,
	MINIMUM_RATE_DELTA,
	MULTIPLE_GROUPS_REPORT_SCHEMA_VERSION,
	NO_MISSING_METRIC_REPS,
	NO_SESSION_JUDGE_BASELINES,
	RESOURCE_SUMMARIES_REPORT_SCHEMA_VERSION,
	SESSION_REPORT_SCHEMA_VERSION,
	sessionSourceRepSchema,
	sha256Schema,
	sourceRepSchema,
};
export type { ComparisonArm };
