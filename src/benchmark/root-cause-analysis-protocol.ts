import { z } from "zod";

import type { Immutable, SchemaPropertyOrder } from "./contracts";
import type { JsonFieldOrder } from "./ordered-json";
import orderedJson from "./ordered-json";
import type { RootCauseBundle } from "./root-cause-bundle";
import serializeRootCauseBundle from "./root-cause-bundle-format";
import type { ValidationFieldOrder } from "./validation-issue-order";
import { visibleControlCharactersInJson } from "./visible-control-characters";

const REQUIRED_TEXT_MINIMUM_CODE_UNITS = 1;

const ROOT_CAUSE_SCHEMA_VERSION = 2;

const AGENT_STAGE_ROLES = [
	"not a factor",
	"contributing factor",
	"root cause",
] as const;

const answeredStageSchema = z
	.object({
		contribution: z.string().nonempty(),
		note: z.string().nonempty(),
		role: z.enum(AGENT_STAGE_ROLES),
		stage: z.string().nonempty(),
	})
	.strict();

const rootCauseLinesSchema = z
	.object({
		end: z.int().positive(),
		start: z.int().positive(),
	})
	.strict()
	.optional();

const answeredRootCauseSchema = z
	.object({
		file: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
		lines: rootCauseLinesSchema,
		stage: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
	})
	.strict()
	.nullable();

const answerSchema = z
	.object({
		narrative: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
		pairedRerun: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
		rootCause: answeredRootCauseSchema,
		stages: z.array(answeredStageSchema),
	})
	.strict();

const analysisPropertyOrder: SchemaPropertyOrder = new Map<
	z.core.$ZodType,
	readonly string[]
>([
	[answerSchema, ["rootCause", "narrative", "pairedRerun", "stages"]],
	[answeredRootCauseSchema.unwrap(), ["stage", "file", "lines"]],
	[rootCauseLinesSchema.unwrap(), ["start", "end"]],
	[answeredStageSchema, ["stage", "role", "note", "contribution"]],
]);

const analysisRootCauseOrder: JsonFieldOrder = {
	children: {
		lines: { fields: ["start", "end"] },
	},
	fields: ["stage", "file", "lines"],
};

const analysisStageOrder: JsonFieldOrder = {
	fields: ["stage", "role", "note", "contribution"],
};

const analysisValidationOrder: ValidationFieldOrder = {
	children: {
		rootCause: analysisRootCauseOrder,
		stages: analysisStageOrder,
	},
	fields: ["rootCause", "narrative", "pairedRerun", "stages"],
};

const analysisRecordBaseFields: readonly string[] = [
	"schemaVersion",
	"run",
	"model",
	"capUsd",
	"startedAt",
	"durationMs",
	"bundleDigest",
	"bundleBytes",
];

const analysisRecordFieldOrder: JsonFieldOrder = {
	children: {
		rootCause: analysisRootCauseOrder,
		stages: analysisStageOrder,
	},
	fields: [
		...analysisRecordBaseFields,
		"outcome",
		...analysisValidationOrder.fields,
		"reason",
		"payload",
		"costUsd",
	],
};

type AnalysisAnswer = Immutable<z.infer<typeof answerSchema>>;

const recordBase = {
	bundleBytes: z.int().nonnegative(),
	bundleDigest: z.string().regex(/^[0-9a-f]{64}$/u),
	capUsd: z.number().positive(),
	costUsd: z.number().nonnegative().optional(),
	durationMs: z.number().nonnegative(),
	model: z.string().nonempty(),
	run: z.string().nonempty(),
	schemaVersion: z.literal(ROOT_CAUSE_SCHEMA_VERSION),
	startedAt: z.iso.datetime(),
};

const neverRanStageSchema = z
	.object({
		role: z.literal("never ran"),
		stage: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
	})
	.strict();

const recordedAnalysisSchema = answerSchema
	.extend({
		...recordBase,
		outcome: z.literal("recorded"),
		stages: z.array(z.union([answeredStageSchema, neverRanStageSchema])),
	})
	.strict();

const failedAnalysisSchema = z
	.object({
		...recordBase,
		outcome: z.literal("failed"),
		payload: z.unknown().optional(),
		reason: z.string().nonempty(),
	})
	.strict();

const rootCauseAnalysisRecordSchema = z.discriminatedUnion("outcome", [
	recordedAnalysisSchema,
	failedAnalysisSchema,
]);

type RecordedAnalysis = Immutable<z.infer<typeof recordedAnalysisSchema>>;

type FailedAnalysis = Immutable<z.infer<typeof failedAnalysisSchema>>;

type RootCauseAnalysisRecord = RecordedAnalysis | FailedAnalysis;

type AnalysisBase = Omit<FailedAnalysis, "outcome" | "reason" | "payload">;

function promptSafeJson(bundle: RootCauseBundle): string {
	return serializeRootCauseBundle(bundle)
		.replaceAll("\u2028", String.raw`\u2028`)
		.replaceAll("\u2029", String.raw`\u2029`);
}

function analysisRecordJson(record: RootCauseAnalysisRecord): string {
	return visibleControlCharactersInJson(
		orderedJson({
			json: JSON.stringify(record),
			order: analysisRecordFieldOrder,
		}),
	);
}

function analysisPrompt(bundleText: string): string {
	return [
		"Say which corpus file, if any, the outcome of the run below most plausibly traces to. Give a null `rootCause` when the records do not point at one file. On a run that passed, a root cause is a file that cost the run a requirement or a grade dimension it would otherwise have met.",
		"The harness refuses an answer that breaks rule 1, 2 or 3:",
		"1. `stages` holds each stage in the run's `stages` exactly once. A stage in `declaredStages` that is missing from the run's `stages` never ran, so leave it out.",
		'2. When `rootCause` names a stage and a corpus file from that stage\'s `corpusReads`, that stage and no other has the role "root cause". When `rootCause` is null, no stage has it.',
		"3. Give `rootCause.lines` only when `corpusFiles` holds the file's body with the root-cause stage in its `readBy`. The range is 1-based and inclusive, and lies within that body.",
		"4. `note` is one sentence on what that stage's record shows. `contribution` is a short phrase saying how the stage moved the run's `outcome`.",
		"5. `narrative` says how the outcome traces to the root cause, or why no corpus file explains it. `pairedRerun` names the rerun that would confirm the reading: the root-cause stage replayed with only the named line range, or the whole file, changed. When `rootCause` is null, it names the rerun that would show no corpus file is at fault.",
		"BEGIN RUN",
		bundleText,
		"END RUN",
		"Answer for the run above: which corpus file, if any, its outcome traces to.",
	].join("\n");
}

export {
	REQUIRED_TEXT_MINIMUM_CODE_UNITS,
	ROOT_CAUSE_SCHEMA_VERSION,
	answerSchema,
	analysisPropertyOrder,
	analysisRootCauseOrder,
	analysisStageOrder,
	analysisValidationOrder,
	analysisRecordBaseFields,
	analysisRecordJson,
	rootCauseAnalysisRecordSchema,
	promptSafeJson,
	analysisPrompt,
};
export type {
	AnalysisAnswer,
	RecordedAnalysis,
	FailedAnalysis,
	RootCauseAnalysisRecord,
	AnalysisBase,
};
