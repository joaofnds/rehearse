import { z } from "zod";

import {
	claudeCallMetricsSchema,
	claudeModelUsageSchema,
} from "./claude-envelope-contract";
import { humanFindingSchema, humanReviewSchema } from "./human-review-contract";
import {
	evidenceLocatorSchema,
	evidenceSchema,
	judgeEvidenceSchema,
	judgeStageEvidenceSchema,
	recordedEvidenceSchema,
	recordedStageEvidenceSchema,
} from "./judge-evidence-contract";
import {
	judgeGradeResponseSchema,
	judgeGradeSchema,
	stageJudgeDimensionOutputSchema,
	stageJudgeDimensionResponseSchema,
	stageJudgeOutputSchema,
	stageJudgeResponseSchema,
} from "./judge-grade-contract";
import {
	stageRubricDimensionSchema,
	stageRubricItemSchema,
	stageRubricSchema,
} from "./stage-rubric-contract";
import {
	judgeAttemptOutcomeSchema,
	judgeAttemptPayloadSchema,
	stageGradeSchema,
	stageScorecardSchema,
} from "./stage-scorecard-contract";
import {
	contextFileSchema,
	localCheckResultSchema,
	stageJudgeInputSchema,
	stageTranscriptSchema,
	stageTurnSchema,
} from "./workflow-stage-contract";

const [
	lineRangeEvidenceLocator,
	diffHunkEvidenceLocator,
	commitSubjectEvidenceLocator,
	exchangeEvidenceLocator,
	harnessEvidenceLocator,
] = evidenceLocatorSchema.options;
const [, rejectedJudgeAttempt] = judgeAttemptOutcomeSchema.options;

type SchemaPropertyOrder = ReadonlyMap<z.core.$ZodType, readonly string[]>;

const contractPropertyOrder: SchemaPropertyOrder = new Map<
	z.core.$ZodType,
	readonly string[]
>([
	[evidenceSchema, ["source", "path", "claim"]],
	[stageTurnSchema, ["status", "message"]],
	[stageRubricItemSchema, ["id", "description"]],
	[stageRubricDimensionSchema, ["id", "description", "good", "excellent"]],
	[stageRubricSchema, ["hardBlockers", "requirements", "dimensions"]],
	[
		lineRangeEvidenceLocator,
		["kind", "file", "startLine", "endLine", "occurrences"],
	],
	[diffHunkEvidenceLocator, ["kind", "file", "hunk", "occurrences"]],
	[commitSubjectEvidenceLocator, ["kind", "index"]],
	[exchangeEvidenceLocator, ["kind", "exchange", "field", "start", "end"]],
	[harnessEvidenceLocator, ["kind", "result", "recorded"]],
	[
		recordedStageEvidenceSchema,
		["source", "path", "claim", "quote", "locator"],
	],
	[judgeStageEvidenceSchema, ["source", "path", "claim", "quote"]],
	[judgeEvidenceSchema, ["source", "path", "claim", "quote"]],
	[recordedEvidenceSchema, ["source", "path", "claim", "quote", "locator"]],
	[judgeGradeResponseSchema, ["requirements", "verdict", "summary"]],
	[judgeGradeSchema, ["requirements", "verdict", "summary"]],
	[
		stageJudgeResponseSchema,
		["hardBlockers", "requirements", "dimensions", "summary"],
	],
	[stageJudgeDimensionResponseSchema, ["id", "grade", "evidence"]],
	[
		stageJudgeOutputSchema,
		["hardBlockers", "requirements", "dimensions", "summary"],
	],
	[stageJudgeDimensionOutputSchema, ["id", "grade", "evidence"]],
	[
		humanFindingSchema,
		["description", "paths", "stage", "judgeAssessment", "rubricId"],
	],
	[humanReviewSchema, ["verdict", "summary", "findings"]],
	[
		claudeModelUsageSchema,
		[
			"inputTokens",
			"outputTokens",
			"cacheReadInputTokens",
			"cacheCreationInputTokens",
			"costUSD",
			"contextWindow",
			"maxOutputTokens",
		],
	],
	[
		claudeCallMetricsSchema,
		[
			"costUsd",
			"inputTokens",
			"outputTokens",
			"cacheReadTokens",
			"cacheWriteTokens",
			"turns",
			"durationMs",
			"apiDurationMs",
			"modelUsage",
		],
	],
	[contextFileSchema, ["path", "content"]],
	[localCheckResultSchema, ["status", "evidence"]],
	[
		stageTranscriptSchema,
		["stage", "sessionId", "costUsd", "providerCalls", "exchanges"],
	],
	[
		stageJudgeInputSchema,
		[
			"stage",
			"kind",
			"task",
			"productBrief",
			"instructions",
			"baselineContext",
			"taskState",
			"transcript",
			"artifact",
			"priorArtifacts",
			"diff",
			"changedPaths",
			"commitSubjects",
			"checkIntegrity",
			"localChecks",
			"harnessFailure",
		],
	],
	[judgeAttemptPayloadSchema, ["payload", "costUsd", "metrics"]],
	[rejectedJudgeAttempt, ["outcome", "error"]],
	[
		stageGradeSchema,
		[
			"hardBlockers",
			"requirements",
			"dimensions",
			"summary",
			"grade",
			"verdict",
		],
	],
	[
		stageScorecardSchema,
		[
			"stage",
			"rubricPath",
			"rubric",
			"input",
			"prompt",
			"attempts",
			"costUsd",
			"grade",
		],
	],
]);

function claudeJsonSchema(
	schema: z.ZodType,
	propertyOrder?: SchemaPropertyOrder,
): string {
	const generated = z.toJSONSchema(schema, {
		override: ({ jsonSchema, zodSchema }) => {
			const fields =
				propertyOrder?.get(zodSchema) ?? contractPropertyOrder.get(zodSchema);
			const { properties, required } = jsonSchema;
			if (fields !== undefined && properties !== undefined) {
				const ordered = new Set([...fields, ...Object.keys(properties)]);
				const entries = [...ordered].flatMap(
					(field): [string, z.core.JSONSchema._JSONSchema][] => {
						const value = properties[field];
						return Object.hasOwn(properties, field) && value !== undefined
							? [[field, value]]
							: [];
					},
				);
				jsonSchema.properties = Object.fromEntries(entries);
				if (required !== undefined) {
					jsonSchema.required = [...ordered].filter((field) =>
						required.includes(field),
					);
				}
			}
		},
	});
	const compatibleEntries = Object.entries(generated).filter(
		([key]) => key !== "$schema",
	);

	return JSON.stringify(Object.fromEntries(compatibleEntries));
}

export { claudeJsonSchema as default };
export type { SchemaPropertyOrder };
