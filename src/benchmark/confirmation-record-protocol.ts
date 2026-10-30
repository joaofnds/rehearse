import { z } from "zod";

import { LEGACY_CASE_ID } from "./config";
import { claudeCallMetricsSchema, stageLetterGradeSchema } from "./contracts";
import { liveCorpusReadSchema } from "./corpus-delivery";

const REQUIRED_TEXT_MINIMUM_CODE_UNITS = 1;

const REQUIRED_LIST_MINIMUM_ITEMS = 1;

const MINIMUM_CONFIRMATION_REPS = 2;

const PIPELINE_CONFIRMATION_SCHEMA_VERSION = 1;
const SESSION_CONFIRMATION_SCHEMA_VERSION = 2;

const confirmationModeSchema = z.enum(["stage", "pipeline", "session"]);

type ConfirmationMode = z.infer<typeof confirmationModeSchema>;

const identitySchema = z
	.string()
	.regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u, "Invalid confirmation identity");

function isConfirmationIdentity(value: string): boolean {
	return identitySchema.safeParse(value).success;
}

const shaSchema = z.string().regex(/^[0-9a-f]{40}$/u, "Invalid Git SHA");

const elapsedSchema = z.number().nonnegative();

const resultEvidenceSchema = z
	.object({
		recordFile: z.string().nonempty(),
		resultSha: shaSchema,
	})
	.strict();

const judgedStageSchema = z
	.object({
		elapsedMs: elapsedSchema,
		evidence: resultEvidenceSchema,
		grade: stageLetterGradeSchema,
		/**
		 * Each file the stage's install held that its session or a sub-agent
		 * still reached through the live install. Absent from stages recorded
		 * before stages read their transcripts for it.
		 */
		liveReads: z.array(liveCorpusReadSchema).optional(),
		stage: z.string().nonempty(),
		status: z.literal("JUDGED"),
		verdict: z.enum(["CONTINUE", "STOP"]),
	})
	.strict();

const failedStageSchema = z
	.object({
		elapsedMs: elapsedSchema.optional(),
		error: z.string().nonempty(),
		evidence: resultEvidenceSchema.optional(),
		stage: z.string().nonempty(),
		status: z.enum(["EXECUTION_FAILED", "METRICS_MISSING"]),
		worktreePath: z.string().nonempty().optional(),
	})
	.strict();

const notReachedStageSchema = z
	.object({
		reason: z.string().nonempty(),
		stage: z.string().nonempty(),
		status: z.literal("NOT_REACHED"),
	})
	.strict();

const stageOutcomeSchema = z.union([
	judgedStageSchema,
	failedStageSchema,
	notReachedStageSchema,
]);

const finalOutcomeSchema = z.union([
	z
		.object({
			evidence: resultEvidenceSchema,
			status: z.literal("JUDGED"),
			verdict: z.enum(["PASS", "FAIL"]),
		})
		.strict(),
	z
		.object({
			error: z.string().nonempty(),
			evidence: resultEvidenceSchema.optional(),
			status: z.enum(["EXECUTION_FAILED", "METRICS_MISSING"]),
			worktreePath: z.string().nonempty().optional(),
		})
		.strict(),
	z
		.object({
			reason: z.string().nonempty(),
			status: z.literal("NOT_REACHED"),
		})
		.strict(),
	z.object({ status: z.literal("NOT_APPLICABLE") }).strict(),
]);

const callEvidenceSchema = z
	.object({
		metrics: claudeCallMetricsSchema,
		role: z.enum(["worker", "product-owner", "stage-judge", "final-judge"]),
	})
	.strict();

const missingCallEvidenceSchema = z
	.array(z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS))
	.min(REQUIRED_LIST_MINIMUM_ITEMS);

const metricsEvidenceSchema = z.discriminatedUnion("status", [
	z
		.object({
			calls: z.array(callEvidenceSchema).nonempty(),
			status: z.literal("COMPLETE"),
		})
		.strict(),
	z
		.object({
			calls: z.array(callEvidenceSchema),
			missing: missingCallEvidenceSchema,
			status: z.literal("MISSING"),
		})
		.strict(),
]);

const lineageSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("SOURCE"), sha: shaSchema }).strict(),
	z
		.object({
			kind: z.literal("CHECKPOINT"),
			lineage: z.string().nonempty(),
			targetSha: shaSchema,
		})
		.strict(),
]);

const legacyCaseIdSchema = identitySchema.optional().default(LEGACY_CASE_ID);

const declaredCaseIdSchema = z.object({ caseId: identitySchema });

export {
	confirmationModeSchema,
	identitySchema,
	isConfirmationIdentity,
	elapsedSchema,
	stageOutcomeSchema,
	finalOutcomeSchema,
	callEvidenceSchema,
	metricsEvidenceSchema,
	lineageSchema,
	legacyCaseIdSchema,
	declaredCaseIdSchema,
	MINIMUM_CONFIRMATION_REPS,
	PIPELINE_CONFIRMATION_SCHEMA_VERSION,
	SESSION_CONFIRMATION_SCHEMA_VERSION,
};
export type { ConfirmationMode };
