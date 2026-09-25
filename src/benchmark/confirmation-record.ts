import { z } from "zod";
import { effortSchema, LEGACY_CASE_ID } from "./config";
import { claudeCallMetricsSchema, stageLetterGradeSchema } from "./contracts";
import { corpusMeasurementSchema } from "./corpus-measurement";

/**
 * The three units a confirmation group repeats: one stage from a checkpoint,
 * the whole pipeline, or one Claude session. Both the rep and group records
 * and the comparison report read it from here, so there is one home for the
 * vocabulary rather than three enums that can drift apart.
 */
export const confirmationModeSchema = z.enum(["stage", "pipeline", "session"]);

export type ConfirmationMode = z.infer<typeof confirmationModeSchema>;

const identitySchema = z
	.string()
	.regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u, "Invalid confirmation identity");
const shaSchema = z.string().regex(/^[0-9a-f]{40}$/u, "Invalid Git SHA");
const elapsedSchema = z.number().nonnegative();

const resultEvidenceSchema = z
	.object({
		resultSha: shaSchema,
		recordFile: z.string().min(1),
	})
	.strict();

const judgedStageSchema = z
	.object({
		stage: z.string().min(1),
		status: z.literal("JUDGED"),
		grade: stageLetterGradeSchema,
		verdict: z.enum(["CONTINUE", "STOP"]),
		elapsedMs: elapsedSchema,
		evidence: resultEvidenceSchema,
	})
	.strict();

const failedStageSchema = z
	.object({
		stage: z.string().min(1),
		status: z.enum(["EXECUTION_FAILED", "METRICS_MISSING"]),
		elapsedMs: elapsedSchema.optional(),
		error: z.string().min(1),
		worktreePath: z.string().min(1).optional(),
		evidence: resultEvidenceSchema.optional(),
	})
	.strict();

const notReachedStageSchema = z
	.object({
		stage: z.string().min(1),
		status: z.literal("NOT_REACHED"),
		reason: z.string().min(1),
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
			status: z.literal("JUDGED"),
			verdict: z.enum(["PASS", "FAIL"]),
			evidence: resultEvidenceSchema,
		})
		.strict(),
	z
		.object({
			status: z.enum(["EXECUTION_FAILED", "METRICS_MISSING"]),
			error: z.string().min(1),
			worktreePath: z.string().min(1).optional(),
			evidence: resultEvidenceSchema.optional(),
		})
		.strict(),
	z
		.object({
			status: z.literal("NOT_REACHED"),
			reason: z.string().min(1),
		})
		.strict(),
	z.object({ status: z.literal("NOT_APPLICABLE") }).strict(),
]);

const callEvidenceSchema = z
	.object({
		role: z.enum(["worker", "product-owner", "stage-judge", "final-judge"]),
		metrics: claudeCallMetricsSchema,
	})
	.strict();

const metricsEvidenceSchema = z.discriminatedUnion("status", [
	z
		.object({
			status: z.literal("COMPLETE"),
			calls: z.array(callEvidenceSchema).min(1),
		})
		.strict(),
	z
		.object({
			status: z.literal("MISSING"),
			calls: z.array(callEvidenceSchema),
			missing: z.array(z.string().min(1)).min(1),
		})
		.strict(),
]);

const lineageSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("SOURCE"), sha: shaSchema }).strict(),
	z
		.object({
			kind: z.literal("CHECKPOINT"),
			lineage: z.string().min(1),
			targetSha: shaSchema,
		})
		.strict(),
]);

/**
 * Optional with a legacy default rather than a version bump: every rep and
 * group record written before cases were declared ran the audit-log case, so
 * the field's absence has one true meaning and v1 stays readable.
 */
const legacyCaseIdSchema = identitySchema.optional().default(LEGACY_CASE_ID);

const declaredCaseIdSchema = z.object({ caseId: identitySchema });

const legacyConfirmationRepRecordSchema = z
	.object({
		schemaVersion: z.literal(1),
		caseId: legacyCaseIdSchema,
		groupId: identitySchema,
		repId: identitySchema,
		ordinal: z.number().int().positive(),
		mode: confirmationModeSchema,
		worktreePath: z.string().min(1),
		lineage: lineageSchema,
		outcome: z.enum(["SUCCESSFUL", "UNSUCCESSFUL"]),
		stages: z.array(stageOutcomeSchema).min(1),
		finalOutcome: finalOutcomeSchema,
		metrics: metricsEvidenceSchema,
		workerTrajectorySteps: z.number().int().nonnegative(),
		elapsedMs: elapsedSchema,
	})
	.strict()
	.superRefine((record, context) => {
		if (record.repId !== `${record.groupId}-rep-${record.ordinal}`) {
			context.addIssue({
				code: "custom",
				message: "Rep identity must match its group and ordinal",
				path: ["repId"],
			});
		}
		if (record.metrics.status === "MISSING") {
			if (record.outcome === "SUCCESSFUL") {
				context.addIssue({
					code: "custom",
					message: "Missing provider metrics cannot produce a successful rep",
					path: ["outcome"],
				});
			}

			return;
		}

		const workerTurns = record.metrics.calls
			.filter(({ role }) => role === "worker")
			.reduce((total, call) => total + call.metrics.turns, 0);
		if (record.workerTrajectorySteps !== workerTurns) {
			context.addIssue({
				code: "custom",
				message:
					"Worker trajectory steps must equal provider-reported worker turns",
				path: ["workerTrajectorySteps"],
			});
		}
		if (record.outcome !== "SUCCESSFUL") {
			return;
		}

		const stagesPassed = record.stages.every(
			(stage) =>
				stage.status === "JUDGED" &&
				stage.verdict === "CONTINUE" &&
				(stage.grade === "A" || stage.grade === "B"),
		);
		const finalPassed =
			record.mode === "pipeline"
				? record.finalOutcome.status === "JUDGED" &&
					record.finalOutcome.verdict === "PASS"
				: record.finalOutcome.status === "NOT_APPLICABLE";
		if (!stagesPassed || !finalPassed) {
			context.addIssue({
				code: "custom",
				message: "Successful reps require passing stage and final outcomes",
				path: ["outcome"],
			});
		}
	});

const sessionResultEvidenceSchema = z
	.object({
		recordFile: z.string().min(1),
		resultSha: z.never().optional(),
	})
	.strict();

const judgedSessionStageOutcomeSchema = z.union([
	z
		.object({
			stage: z.literal("checks"),
			status: z.literal("JUDGED"),
			grade: z.literal("A"),
			verdict: z.literal("CONTINUE"),
			elapsedMs: elapsedSchema,
			evidence: sessionResultEvidenceSchema,
		})
		.strict(),
	z
		.object({
			stage: z.literal("checks"),
			status: z.literal("JUDGED"),
			grade: z.literal("F"),
			verdict: z.literal("STOP"),
			elapsedMs: elapsedSchema,
			evidence: sessionResultEvidenceSchema,
		})
		.strict(),
]);

const sessionStageOutcomeSchema = z.union([
	judgedSessionStageOutcomeSchema,
	z
		.object({
			stage: z.literal("checks"),
			status: z.literal("EXECUTION_FAILED"),
			elapsedMs: elapsedSchema.optional(),
			error: z.string().min(1),
			evidence: sessionResultEvidenceSchema,
		})
		.strict(),
	z
		.object({
			stage: z.literal("checks"),
			status: z.literal("METRICS_MISSING"),
			elapsedMs: elapsedSchema.optional(),
			error: z.string().min(1),
			evidence: sessionResultEvidenceSchema,
		})
		.strict(),
	z
		.object({
			stage: z.literal("checks"),
			status: z.literal("NOT_REACHED"),
			reason: z.string().min(1),
			evidence: sessionResultEvidenceSchema,
		})
		.strict(),
]);

export const sessionConfirmationRepRecordSchema = z
	.object({
		schemaVersion: z.literal(2),
		caseId: identitySchema,
		groupId: identitySchema,
		repId: identitySchema,
		ordinal: z.number().int().positive(),
		mode: z.literal("session"),
		attemptDirectory: z.never().optional(),
		worktreePath: z.never().optional(),
		lineage: z
			.object({ kind: z.literal("SESSION"), lineage: z.string().min(1) })
			.strict(),
		outcome: z.enum(["SUCCESSFUL", "UNSUCCESSFUL"]),
		stages: z.array(sessionStageOutcomeSchema).length(1),
		finalOutcome: z.object({ status: z.literal("NOT_APPLICABLE") }).strict(),
		metrics: metricsEvidenceSchema,
		workerTrajectorySteps: z.number().int().nonnegative(),
		elapsedMs: elapsedSchema,
	})
	.strict()
	.superRefine((record, context) => {
		if (record.repId !== `${record.groupId}-rep-${record.ordinal}`) {
			context.addIssue({
				code: "custom",
				message: "Rep identity must match its group and ordinal",
				path: ["repId"],
			});
		}
		const workerTurns = record.metrics.calls
			.filter(({ role }) => role === "worker")
			.reduce((total, call) => total + call.metrics.turns, 0);
		if (record.workerTrajectorySteps !== workerTurns) {
			context.addIssue({
				code: "custom",
				message:
					"Worker trajectory steps must equal provider-reported worker turns",
				path: ["workerTrajectorySteps"],
			});
		}
		const [checks] = record.stages;
		if (
			record.outcome === "SUCCESSFUL" &&
			(record.metrics.status === "MISSING" ||
				checks?.status !== "JUDGED" ||
				checks.verdict !== "CONTINUE" ||
				checks.grade !== "A")
		) {
			context.addIssue({
				code: "custom",
				message: "Successful session reps require passing checks and metrics",
				path: ["outcome"],
			});
		}
		if (
			record.outcome === "UNSUCCESSFUL" &&
			record.metrics.status === "COMPLETE" &&
			checks?.status === "JUDGED" &&
			checks.verdict === "CONTINUE" &&
			checks.grade === "A"
		) {
			context.addIssue({
				code: "custom",
				message:
					"Passing checks with complete metrics require a successful rep",
				path: ["outcome"],
			});
		}
	});

const parsedConfirmationRepRecordSchema = z.union([
	legacyConfirmationRepRecordSchema,
	sessionConfirmationRepRecordSchema,
]);

export const confirmationRepRecordSchema = legacyConfirmationRepRecordSchema;

export type ConfirmationRepRecord = z.infer<
	typeof legacyConfirmationRepRecordSchema
>;
export type SessionConfirmationRepRecord = z.infer<
	typeof sessionConfirmationRepRecordSchema
>;
export type ParsedConfirmationRepRecord = z.infer<
	typeof parsedConfirmationRepRecordSchema
>;

export function parseConfirmationRepRecord(
	text: string,
): ParsedConfirmationRepRecord {
	return parsedConfirmationRepRecordSchema.parse(JSON.parse(text));
}

const frozenFileSchema = z
	.object({
		kind: z.enum([
			"checkpoint",
			"corpus",
			"rubric",
			"pipeline",
			"instructions",
			"task",
			"product-brief",
		]),
		path: z.string().min(1),
		sha256: z.string().regex(/^[0-9a-f]{64}$/u, "Invalid SHA-256 digest"),
	})
	.strict();

const frozenInputsSchema = z
	.object({
		lineage: lineageSchema,
		files: z.array(frozenFileSchema).min(1),
		model: z.string().min(1),
		effort: effortSchema.optional(),
		judgeModel: z.string().min(1),
		judgeEffort: effortSchema.optional(),
		sessionBudgetUsd: z.number().positive(),
		pipelinePath: z.string().min(1),
		corpusVersion: corpusMeasurementSchema.optional(),
	})
	.strict();

const projectedCostSchema = z
	.object({
		reps: z.number().int().min(2),
		perRepMaximumUsd: z.number().nonnegative(),
		totalMaximumUsd: z.number().nonnegative(),
	})
	.strict();

const sessionFrozenFileSchema = z
	.object({
		kind: z.enum(["case", "fixture", "transcript", "corpus"]),
		path: z.string().min(1),
		sha256: z.string().regex(/^[0-9a-f]{64}$/u, "Invalid SHA-256 digest"),
	})
	.strict();

const sessionProjectedCostSchema = projectedCostSchema.extend({
	preflightMaximumUsd: z.number().nonnegative(),
});

const preflightEvidenceSchema = z.discriminatedUnion("status", [
	z
		.object({
			status: z.literal("COMPLETE"),
			call: callEvidenceSchema.refine(({ role }) => role === "worker", {
				message: "Session preflight is a worker provider call",
			}),
		})
		.strict(),
	z
		.object({ status: z.literal("MISSING"), missing: z.string().min(1) })
		.strict(),
]);

const repRecordReferenceSchema = z
	.object({
		repId: identitySchema,
		ordinal: z.number().int().positive(),
		path: z.string().min(1),
	})
	.strict();

const legacyConfirmationGroupRecordSchema = z
	.object({
		schemaVersion: z.literal(1),
		caseId: legacyCaseIdSchema,
		groupId: identitySchema,
		mode: confirmationModeSchema,
		reps: z.number().int().min(2),
		declaredStages: z.array(z.string().min(1)).min(1),
		inputs: frozenInputsSchema,
		projectedCost: projectedCostSchema,
		approval: z
			.object({
				method: z.enum(["interactive", "yes"]),
				approved: z.literal(true),
			})
			.strict(),
		repRecords: z.array(repRecordReferenceSchema),
		reportFile: z.string().min(1),
		makespanMs: elapsedSchema,
	})
	.strict()
	.superRefine((record, context) => {
		const referencesEveryRep =
			record.repRecords.length === record.reps &&
			record.repRecords.every(
				(reference, index) =>
					reference.ordinal === index + 1 &&
					reference.repId === `${record.groupId}-rep-${index + 1}`,
			);
		if (!referencesEveryRep) {
			context.addIssue({
				code: "custom",
				message: "Group must reference every requested rep exactly once",
				path: ["repRecords"],
			});
		}
		if (record.projectedCost.reps !== record.reps) {
			context.addIssue({
				code: "custom",
				message: "Projected cost rep count must match the group",
				path: ["projectedCost", "reps"],
			});
		}
	});

export const sessionConfirmationGroupRecordSchema = z
	.object({
		schemaVersion: z.literal(2),
		caseId: identitySchema,
		groupId: identitySchema,
		mode: z.literal("session"),
		reps: z.number().int().min(2),
		declaredStages: z.tuple([z.literal("checks")]),
		inputs: z
			.object({
				lineage: z
					.object({ kind: z.literal("SESSION"), lineage: z.string().min(1) })
					.strict(),
				files: z.array(sessionFrozenFileSchema).min(1),
				model: z.string().min(1),
				effort: effortSchema.optional(),
				judgeModel: z.never().optional(),
				judgeEffort: z.never().optional(),
				sessionBudgetUsd: z.number().positive(),
				pipelinePath: z.never().optional(),
				corpusVersion: corpusMeasurementSchema.optional(),
			})
			.strict(),
		projectedCost: sessionProjectedCostSchema,
		preflight: preflightEvidenceSchema,
		approval: z
			.object({
				method: z.enum(["interactive", "yes"]),
				approved: z.literal(true),
			})
			.strict(),
		repRecords: z.array(repRecordReferenceSchema),
		reportFile: z.string().min(1),
		makespanMs: elapsedSchema,
	})
	.strict()
	.superRefine((record, context) => {
		const referencesEveryRep =
			record.repRecords.length === record.reps &&
			record.repRecords.every(
				(reference, index) =>
					reference.ordinal === index + 1 &&
					reference.repId === `${record.groupId}-rep-${index + 1}`,
			);
		if (!referencesEveryRep) {
			context.addIssue({
				code: "custom",
				message: "Group must reference every requested rep exactly once",
				path: ["repRecords"],
			});
		}
		if (record.projectedCost.reps !== record.reps) {
			context.addIssue({
				code: "custom",
				message: "Projected cost rep count must match the group",
				path: ["projectedCost", "reps"],
			});
		}
		const expectedTotal = Number(
			(
				record.projectedCost.preflightMaximumUsd +
				record.reps * record.projectedCost.perRepMaximumUsd
			).toPrecision(15),
		);
		if (record.projectedCost.totalMaximumUsd !== expectedTotal) {
			context.addIssue({
				code: "custom",
				message:
					"Session projected total must equal preflight plus every rep maximum",
				path: ["projectedCost", "totalMaximumUsd"],
			});
		}
	});

const parsedConfirmationGroupRecordSchema = z.union([
	legacyConfirmationGroupRecordSchema,
	sessionConfirmationGroupRecordSchema,
]);

export const confirmationGroupRecordSchema =
	legacyConfirmationGroupRecordSchema;

export type ConfirmationGroupRecord = z.infer<
	typeof legacyConfirmationGroupRecordSchema
>;
export type SessionConfirmationGroupRecord = z.infer<
	typeof sessionConfirmationGroupRecordSchema
>;
export type ParsedConfirmationGroupRecord = z.infer<
	typeof parsedConfirmationGroupRecordSchema
>;

export function parseConfirmationGroupRecord(
	text: string,
): ParsedConfirmationGroupRecord {
	return parsedConfirmationGroupRecordSchema.parse(JSON.parse(text));
}

export interface DeclaredConfirmationGroup {
	readonly record: ParsedConfirmationGroupRecord;
	readonly declaredCaseId: string | undefined;
}

/**
 * `caseId` reads back as `LEGACY_CASE_ID` whether the record declared that case
 * or declared none, and a reader that must not treat the second as a claim
 * needs them apart. Every other reader wants the legacy default.
 */
export function parseDeclaredConfirmationGroup(
	text: string,
): DeclaredConfirmationGroup {
	const document: unknown = JSON.parse(text);
	const record = parsedConfirmationGroupRecordSchema.parse(document);
	const declared = declaredCaseIdSchema.safeParse(document);

	return { record, declaredCaseId: declared.data?.caseId };
}
