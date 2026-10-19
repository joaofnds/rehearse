import { z } from "zod";

import type { Immutable } from "./contracts";
import corpusMeasurementSchema from "./corpus-measurement";
import { readManifestSchema } from "./read-manifest";
import type { ValidationFieldOrder } from "./validation-issue-order";

const REQUIRED_TEXT_MINIMUM_CODE_UNITS = 1;

const stageRecordFieldOrder: ValidationFieldOrder = {
	children: {
		corpusFiles: { fields: ["path"] },
		corpusVersion: { fields: ["kind", "digest", "refusal"] },
		input: { fields: ["commitSubjects", "changedPaths"] },
		readManifest: { fields: ["path", "half", "role", "evidence", "sha256"] },
	},
	fields: [
		"status",
		"error",
		"grade",
		"hardBlockers",
		"requirements",
		"dimensions",
		"summary",
		"input",
		"corpusVersion",
		"readManifest",
		"corpusFiles",
	],
};

const finalRecordFieldOrder: ValidationFieldOrder = {
	children: { grade: { fields: ["verdict", "summary"] } },
	fields: ["status", "grade"],
};

const gradeSchema = z.record(z.string(), z.unknown());

const recordedStageChangesSchema = z
	.object({
		changedPaths: z.array(z.string()).optional(),
		commitSubjects: z.array(z.string()).optional(),
	})
	.loose()
	.optional();

const recordedCorpusPathSchema = z
	.object({ path: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS) })
	.loose();

/**
 * The parts of a stage record the analysis reads. The prompt, transcript and
 * diff stay out: they are the bulk of a record, and the grade already says
 * what the Judge made of them.
 */
const stageRecordSchema = z
	.object({
		corpusFiles: z.array(recordedCorpusPathSchema).optional(),
		corpusVersion: corpusMeasurementSchema.optional(),
		dimensions: z.unknown().optional(),
		error: z.string().optional(),
		grade: gradeSchema.nullable().optional(),
		hardBlockers: z.unknown().optional(),
		input: recordedStageChangesSchema,
		readManifest: readManifestSchema.optional(),
		requirements: z.unknown().optional(),
		status: z.string().optional(),
		summary: z.unknown().optional(),
	})
	.loose();

const finalRecordSchema = z
	.object({
		grade: z
			.object({ summary: z.string(), verdict: z.string() })
			.loose()
			.nullable()
			.optional(),
		status: z.string().nonempty(),
	})
	.loose();

type StageRecord = Immutable<z.infer<typeof stageRecordSchema>>;

type BundleStage = Immutable<{
	stage: string;
	grade: z.infer<typeof gradeSchema> | null;
	stopped: string | null;
	commitSubjects: string[];
	changedPaths: string[];
	corpusReads: string[];
}>;

type BundleOutcome = Immutable<{
	status: string;
	verdict?: string;
	summary?: string;
	stage?: string;
	error?: string;
}>;

/** One version of a corpus file, with the stages that read that version. */
type BundleCorpusFile = Immutable<{
	path: string;
	sha256: string;
	body: string;
	readBy: string[];
}>;

/** Everything the analysis session reads about one run, and nothing else. */
type RootCauseBundle = Immutable<{
	run: string;
	caseId: string;
	task: string;
	productBrief: string;
	declaredStages: string[];
	stages: BundleStage[];
	outcome: BundleOutcome;
	corpusFiles: BundleCorpusFile[];
}>;

export {
	stageRecordSchema,
	finalRecordSchema,
	stageRecordFieldOrder,
	finalRecordFieldOrder,
};
export type {
	StageRecord,
	BundleStage,
	BundleOutcome,
	BundleCorpusFile,
	RootCauseBundle,
};
