import { z } from "zod";

import type { Immutable } from "./contracts";
import {
	REQUIRED_TEXT_MINIMUM_CODE_UNITS,
	ROOT_CAUSE_SCHEMA_VERSION,
	analysisRecordBaseFields,
	analysisRootCauseOrder,
	analysisStageOrder,
	analysisValidationOrder,
	rootCauseAnalysisRecordSchema,
} from "./root-cause-analysis-protocol";
import type { RootCauseAnalysisRecord } from "./root-cause-analysis-protocol";
import orderedValidationIssues from "./validation-issue-order";
import type { ValidationFieldOrder } from "./validation-issue-order";

const LEGACY_ROOT_CAUSE_SCHEMA_VERSION = 1;

const storedVersionOneValidationOrder: ValidationFieldOrder = {
	children: {
		culprit: analysisRootCauseOrder,
		stages: analysisStageOrder,
	},
	fields: [
		...analysisRecordBaseFields,
		"costUsd",
		"outcome",
		"culprit",
		"narrative",
		"pairedRerun",
		"stages",
		"reason",
		"payload",
	],
};

const storedVersionTwoValidationOrder: ValidationFieldOrder = {
	children: {
		rootCause: analysisRootCauseOrder,
		stages: analysisStageOrder,
	},
	fields: [
		...analysisValidationOrder.fields,
		...analysisRecordBaseFields,
		"costUsd",
		"outcome",
		"reason",
		"payload",
	],
};

const VERSION_ONE_ROLES = {
	contributing: "contributing factor",
	"not implicated": "not a factor",
	"primary culprit": "root cause",
} as const;

const versionOneBase = {
	bundleBytes: z.int().nonnegative(),
	bundleDigest: z.string().regex(/^[0-9a-f]{64}$/u),
	capUsd: z.number().positive(),
	costUsd: z.number().nonnegative().optional(),
	durationMs: z.number().nonnegative(),
	model: z.string().nonempty(),
	run: z.string().nonempty(),
	schemaVersion: z.literal(LEGACY_ROOT_CAUSE_SCHEMA_VERSION),
	startedAt: z.iso.datetime(),
};

const versionOneCulpritLinesSchema = z
	.object({
		end: z.int().positive(),
		start: z.int().positive(),
	})
	.strict()
	.optional();

const versionOneCulpritSchema = z
	.object({
		file: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
		lines: versionOneCulpritLinesSchema,
		stage: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
	})
	.strict()
	.nullable();

const versionOneAnsweredStageSchema = z
	.object({
		contribution: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
		note: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
		role: z.enum(["not implicated", "contributing", "primary culprit"]),
		stage: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
	})
	.strict();

const versionOneNeverRanStageSchema = z
	.object({
		role: z.literal("never ran"),
		stage: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
	})
	.strict();

const versionOneAnalysisStagesSchema = z.array(
	z.union([versionOneAnsweredStageSchema, versionOneNeverRanStageSchema]),
);

const versionOneRecordSchema = z.discriminatedUnion("outcome", [
	z
		.object({
			...versionOneBase,
			culprit: versionOneCulpritSchema,
			narrative: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
			outcome: z.literal("recorded"),
			pairedRerun: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
			stages: versionOneAnalysisStagesSchema,
		})
		.strict(),
	z
		.object({
			...versionOneBase,
			outcome: z.literal("failed"),
			payload: z.unknown().optional(),
			reason: z.string().nonempty(),
		})
		.strict(),
]);

const storedAnalysisSchema = z.discriminatedUnion("schemaVersion", [
	rootCauseAnalysisRecordSchema,
	versionOneRecordSchema,
]);

const versionOneRecordContextSchema = z.looseObject({
	schemaVersion: z.literal(LEGACY_ROOT_CAUSE_SCHEMA_VERSION),
});

function currentRecord(
	record: Immutable<z.infer<typeof storedAnalysisSchema>>,
): RootCauseAnalysisRecord {
	if (record.schemaVersion === ROOT_CAUSE_SCHEMA_VERSION) {
		return record;
	}

	if (record.outcome === "failed") {
		return { ...record, schemaVersion: 2 };
	}

	const { culprit, stages, ...fields } = record;

	return {
		...fields,
		rootCause: culprit,
		schemaVersion: 2,
		stages: stages.map((stage) =>
			stage.role === "never ran"
				? stage
				: {
						contribution: stage.contribution,
						note: stage.note,
						role: VERSION_ONE_ROLES[stage.role],
						stage: stage.stage,
					},
		),
	};
}

async function readStoredAnalysis(
	file: string,
): Promise<RootCauseAnalysisRecord> {
	const storedRecord: unknown = await Bun.file(file).json();
	const parsed = storedAnalysisSchema.safeParse(storedRecord);
	if (!parsed.success) {
		const legacy =
			versionOneRecordContextSchema.safeParse(storedRecord).success;
		const issues = orderedValidationIssues({
			error: parsed.error,
			order: legacy
				? storedVersionOneValidationOrder
				: storedVersionTwoValidationOrder,
		});

		throw new z.ZodError([...issues]);
	}

	return currentRecord(parsed.data);
}

export { readStoredAnalysis as default };
