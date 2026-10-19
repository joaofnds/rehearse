import { z } from "zod";

import {
	PIPELINE_CONFIRMATION_SCHEMA_VERSION,
	SESSION_CONFIRMATION_SCHEMA_VERSION,
	confirmationModeSchema,
	elapsedSchema,
	finalOutcomeSchema,
	identitySchema,
	legacyCaseIdSchema,
	lineageSchema,
	metricsEvidenceSchema,
	stageOutcomeSchema,
} from "./confirmation-record-protocol";
import type { Immutable } from "./contracts";
import { parseRecord } from "./record-parse-cache";

const SINGLE_SESSION_STAGE_COUNT = 1;

const NO_WORKER_TURNS = 0;

const legacyRepFieldsSchema = z
	.object({
		caseId: legacyCaseIdSchema,
		elapsedMs: elapsedSchema,
		finalOutcome: finalOutcomeSchema,
		groupId: identitySchema,
		lineage: lineageSchema,
		metrics: metricsEvidenceSchema,
		mode: confirmationModeSchema,
		ordinal: z.number().int().positive(),
		outcome: z.enum(["SUCCESSFUL", "UNSUCCESSFUL"]),
		repId: identitySchema,
		schemaVersion: z.literal(PIPELINE_CONFIRMATION_SCHEMA_VERSION),
		stages: z.array(stageOutcomeSchema).nonempty(),
		workerTrajectorySteps: z.number().int().nonnegative(),
		worktreePath: z.string().nonempty(),
	})
	.strict();

type WorkerTrajectoryEvidence = Immutable<
	Pick<
		z.infer<typeof legacyRepFieldsSchema>,
		"metrics" | "workerTrajectorySteps"
	>
>;

function workerTrajectoryMismatch(record: WorkerTrajectoryEvidence): boolean {
	const workerTurns = record.metrics.calls
		.filter(({ role }) => role === "worker")
		.reduce((total, call) => total + call.metrics.turns, NO_WORKER_TURNS);
	return record.workerTrajectorySteps !== workerTurns;
}

function passingLegacyOutcomes(
	record: Immutable<z.infer<typeof legacyRepFieldsSchema>>,
): boolean {
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

	return stagesPassed && finalPassed;
}

const legacyConfirmationRepRecordSchema = legacyRepFieldsSchema.superRefine(
	(record, context) => {
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

		if (workerTrajectoryMismatch(record)) {
			context.addIssue({
				code: "custom",
				message:
					"Worker trajectory steps must equal provider-reported worker turns",
				path: ["workerTrajectorySteps"],
			});
		}

		if (record.outcome === "SUCCESSFUL" && !passingLegacyOutcomes(record)) {
			context.addIssue({
				code: "custom",
				message: "Successful reps require passing stage and final outcomes",
				path: ["outcome"],
			});
		}
	},
);

const sessionResultEvidenceSchema = z
	.object({
		recordFile: z.string().nonempty(),
		resultSha: z.never().optional(),
	})
	.strict();

const judgedSessionStageOutcomeSchema = z.union([
	z
		.object({
			elapsedMs: elapsedSchema,
			evidence: sessionResultEvidenceSchema,
			grade: z.literal("A"),
			stage: z.literal("checks"),
			status: z.literal("JUDGED"),
			verdict: z.literal("CONTINUE"),
		})
		.strict(),
	z
		.object({
			elapsedMs: elapsedSchema,
			evidence: sessionResultEvidenceSchema,
			grade: z.literal("F"),
			stage: z.literal("checks"),
			status: z.literal("JUDGED"),
			verdict: z.literal("STOP"),
		})
		.strict(),
]);

const sessionStageOutcomeSchema = z.union([
	judgedSessionStageOutcomeSchema,
	z
		.object({
			elapsedMs: elapsedSchema.optional(),
			error: z.string().nonempty(),
			evidence: sessionResultEvidenceSchema,
			stage: z.literal("checks"),
			status: z.literal("EXECUTION_FAILED"),
		})
		.strict(),
	z
		.object({
			elapsedMs: elapsedSchema.optional(),
			error: z.string().nonempty(),
			evidence: sessionResultEvidenceSchema,
			stage: z.literal("checks"),
			status: z.literal("METRICS_MISSING"),
		})
		.strict(),
	z
		.object({
			evidence: sessionResultEvidenceSchema,
			reason: z.string().nonempty(),
			stage: z.literal("checks"),
			status: z.literal("NOT_REACHED"),
		})
		.strict(),
]);

const sessionConfirmationRepRecordSchema = z
	.object({
		attemptDirectory: z.never().optional(),
		caseId: identitySchema,
		elapsedMs: elapsedSchema,
		finalOutcome: z.object({ status: z.literal("NOT_APPLICABLE") }).strict(),
		groupId: identitySchema,
		lineage: z
			.object({ kind: z.literal("SESSION"), lineage: z.string().nonempty() })
			.strict(),
		metrics: metricsEvidenceSchema,
		mode: z.literal("session"),
		ordinal: z.number().int().positive(),
		outcome: z.enum(["SUCCESSFUL", "UNSUCCESSFUL"]),
		repId: identitySchema,
		schemaVersion: z.literal(SESSION_CONFIRMATION_SCHEMA_VERSION),
		stages: z
			.array(sessionStageOutcomeSchema)
			.length(SINGLE_SESSION_STAGE_COUNT),
		workerTrajectorySteps: z.number().int().nonnegative(),
		worktreePath: z.never().optional(),
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

		if (workerTrajectoryMismatch(record)) {
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

const confirmationRepRecordSchema = legacyConfirmationRepRecordSchema;

type ConfirmationRepRecord = z.infer<typeof legacyConfirmationRepRecordSchema>;

type SessionConfirmationRepRecord = z.infer<
	typeof sessionConfirmationRepRecordSchema
>;

type ParsedConfirmationRepRecord = z.infer<
	typeof parsedConfirmationRepRecordSchema
>;

function parseConfirmationRepRecord(
	text: string,
): Immutable<ParsedConfirmationRepRecord> {
	return parseRecord(parsedConfirmationRepRecordSchema, text);
}

export {
	sessionConfirmationRepRecordSchema,
	confirmationRepRecordSchema,
	parseConfirmationRepRecord,
};
export type {
	ConfirmationRepRecord,
	SessionConfirmationRepRecord,
	ParsedConfirmationRepRecord,
};
