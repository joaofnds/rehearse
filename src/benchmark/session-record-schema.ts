import { z } from "zod";

import { startedAtSchema } from "./recorded-time";
import {
	EXECUTION_FAILURE_SESSION_SCHEMA_VERSION,
	LEGACY_SESSION_SCHEMA_VERSION,
	STATE_GRADING_SESSION_SCHEMA_VERSION,
	contextManifestSchema,
	legacyContextManifestSchema,
	legacyManifestDivergenceSchema,
	manifestDivergenceSchema,
} from "./session-record-context-schema";
import {
	executionFailedSessionAttemptRecordFields,
	sessionAttemptRecordFields,
	sessionAttemptRecordV3Fields,
	stateGradeFields,
} from "./session-record-fields";
import refineSessionAttemptRecord from "./session-record-outcome";

const sessionAttemptStateSchema = z
	.object({
		caseId: z.string().nonempty(),
		lineage: z.string().nonempty(),
		outcome: z.enum([
			"SUCCESSFUL",
			"UNSUCCESSFUL",
			"NO_REPLY",
			"EXECUTION_FAILED",
		]),
		schemaVersion: z.union([
			z.literal(LEGACY_SESSION_SCHEMA_VERSION),
			z.literal(EXECUTION_FAILURE_SESSION_SCHEMA_VERSION),
			z.literal(STATE_GRADING_SESSION_SCHEMA_VERSION),
		]),
		...stateGradeFields,
	})
	.superRefine((record, context) => {
		if (
			(record.schemaVersion === EXECUTION_FAILURE_SESSION_SCHEMA_VERSION) !==
			(record.outcome === "EXECUTION_FAILED")
		) {
			context.addIssue({
				code: "custom",
				message: "Execution failures use version 2",
				path: ["outcome"],
			});
		}
		if (
			(record.stateResults !== undefined &&
				record.stateGradingError !== undefined) ||
			(record.schemaVersion !== STATE_GRADING_SESSION_SCHEMA_VERSION &&
				(record.stateResults !== undefined ||
					record.stateGradingError !== undefined))
		) {
			context.addIssue({
				code: "custom",
				message:
					"Saved state outcomes require version 3 and cannot accompany a grading error",
			});
		}
	});

type SessionAttemptState = z.infer<typeof sessionAttemptStateSchema>;

const legacyUntaggedSessionAttemptRecordSchema = z
	.object({
		schemaVersion: z.literal(LEGACY_SESSION_SCHEMA_VERSION),
		...sessionAttemptRecordFields,
		contextManifest: legacyContextManifestSchema,
		divergences: z.array(legacyManifestDivergenceSchema).optional(),
	})
	.strict()
	.superRefine(refineSessionAttemptRecord);

const legacyTaggedSessionAttemptRecordSchema = z
	.object({
		schemaVersion: z.literal(LEGACY_SESSION_SCHEMA_VERSION),
		...sessionAttemptRecordFields,
		contextManifest: contextManifestSchema.optional(),
		divergences: z.array(manifestDivergenceSchema).optional(),
	})
	.strict()
	.superRefine(refineSessionAttemptRecord);

const legacySessionAttemptRecordSchema = legacyTaggedSessionAttemptRecordSchema;

const executionFailedSessionAttemptRecordSchema = z
	.object({
		...executionFailedSessionAttemptRecordFields,
		startedAt: startedAtSchema.optional(),
	})
	.strict();

const sessionAttemptRecordV3Schema = z
	.object({
		...sessionAttemptRecordV3Fields,
		startedAt: startedAtSchema.optional(),
	})
	.strict()
	.superRefine(refineSessionAttemptRecord);

const writableSessionAttemptRecordSchema = z.union([
	z
		.object({
			...executionFailedSessionAttemptRecordFields,
			startedAt: startedAtSchema,
		})
		.strict(),
	z
		.object({ ...sessionAttemptRecordV3Fields, startedAt: startedAtSchema })
		.strict()
		.superRefine(refineSessionAttemptRecord),
]);

const sessionAttemptRecordSchema = z.union([
	legacyUntaggedSessionAttemptRecordSchema,
	legacyTaggedSessionAttemptRecordSchema,
	executionFailedSessionAttemptRecordSchema,
	sessionAttemptRecordV3Schema,
]);

type LegacyUntaggedSessionAttemptRecord = z.infer<
	typeof legacyUntaggedSessionAttemptRecordSchema
>;

type LegacyTaggedSessionAttemptRecord = z.infer<
	typeof legacyTaggedSessionAttemptRecordSchema
>;

type LegacySessionAttemptRecord = LegacyTaggedSessionAttemptRecord;

type ExecutionFailedSessionAttemptRecord = z.infer<
	typeof executionFailedSessionAttemptRecordSchema
>;

type SessionAttemptRecordV3 = z.infer<typeof sessionAttemptRecordV3Schema>;

type SessionAttemptRecord = z.infer<typeof sessionAttemptRecordSchema>;

export {
	sessionAttemptStateSchema,
	legacyUntaggedSessionAttemptRecordSchema,
	legacyTaggedSessionAttemptRecordSchema,
	legacySessionAttemptRecordSchema,
	executionFailedSessionAttemptRecordSchema,
	sessionAttemptRecordV3Schema,
	writableSessionAttemptRecordSchema,
	sessionAttemptRecordSchema,
};
export type {
	SessionAttemptState,
	LegacyUntaggedSessionAttemptRecord,
	LegacyTaggedSessionAttemptRecord,
	LegacySessionAttemptRecord,
	ExecutionFailedSessionAttemptRecord,
	SessionAttemptRecordV3,
	SessionAttemptRecord,
};
