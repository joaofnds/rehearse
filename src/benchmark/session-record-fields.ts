import { z } from "zod";

import { effortSchema } from "./config";
import { contextEvidenceSchema } from "./context-evidence";
import { claudeCallMetricsSchema } from "./contracts";
import corpusMeasurementSchema from "./corpus-measurement";
import { readManifestSchema } from "./read-manifest";
import { checkResultSchema } from "./session-check";
import {
	EMPTY_COLLECTION_LENGTH,
	EXECUTION_FAILURE_SESSION_SCHEMA_VERSION,
	STATE_GRADING_SESSION_SCHEMA_VERSION,
	contextManifestSchema,
	corpusDeliveryRecordSchema,
	corpusFileSchema,
	corpusSnapshotOriginSchema,
	manifestDivergenceSchema,
	sessionSetupRecordSchema,
	sha256Schema,
} from "./session-record-context-schema";
import { stateResultSchema } from "./session-state-check";
import { transcriptDiagnosticsSchema } from "./transcript";

const sessionAttemptRecordFields = {
	caseId: z.string().nonempty(),
	checks: z.array(checkResultSchema),
	contextEvidence: contextEvidenceSchema.optional(),
	corpusDelivery: corpusDeliveryRecordSchema.optional(),
	corpusFiles: z.array(corpusFileSchema),
	corpusOrigin: corpusSnapshotOriginSchema.optional(),
	corpusVersion: corpusMeasurementSchema.optional(),
	effort: effortSchema.optional(),
	elapsedMs: z.number().nonnegative(),
	lineage: z.string().nonempty(),
	metrics: claudeCallMetricsSchema.optional(),
	model: z.string().nonempty(),
	outcome: z.enum(["SUCCESSFUL", "UNSUCCESSFUL", "NO_REPLY"]),
	prompt: z.string().nonempty(),
	reply: z.string().optional(),
	sessionBudgetUsd: z.number().positive(),
	settingsDigest: sha256Schema.optional(),
	setup: sessionSetupRecordSchema.optional(),
	spendCeilingUsd: z.number().positive().optional(),
	transcriptDiagnostics: transcriptDiagnosticsSchema.optional(),
	transcriptFile: z.string().nonempty(),
};

const unavailableSubagentsSchema = z.array(z.string().nonempty()).optional();

const stateGradeFields = {
	stateGradingError: z.string().nonempty().optional(),
	stateResults: z.array(stateResultSchema).optional(),
};

const executionFailedSessionAttemptRecordFields = {
	caseId: z.string().nonempty(),
	checks: z.array(checkResultSchema).length(EMPTY_COLLECTION_LENGTH),
	contextEvidence: contextEvidenceSchema.optional(),
	contextManifest: z.undefined().optional(),
	corpusDelivery: corpusDeliveryRecordSchema.optional(),
	corpusFiles: z.array(corpusFileSchema),
	corpusOrigin: corpusSnapshotOriginSchema.optional(),
	corpusVersion: corpusMeasurementSchema.optional(),
	divergences: z.undefined().optional(),
	effort: effortSchema.optional(),
	elapsedMs: z.number().nonnegative(),
	error: z.string().nonempty(),
	lineage: z.string().nonempty(),
	metrics: claudeCallMetricsSchema.optional(),
	model: z.string().nonempty(),
	outcome: z.literal("EXECUTION_FAILED"),
	prompt: z.string().nonempty(),
	readManifest: readManifestSchema.optional(),
	reply: z.undefined().optional(),
	schemaVersion: z.literal(EXECUTION_FAILURE_SESSION_SCHEMA_VERSION),
	sessionBudgetUsd: z.number().positive(),
	settingsDigest: sha256Schema.optional(),
	setup: sessionSetupRecordSchema.optional(),
	spendCeilingUsd: z.number().positive().optional(),
	transcriptDiagnostics: transcriptDiagnosticsSchema.optional(),
	transcriptFile: z.string().nonempty(),
	unavailableSubagents: unavailableSubagentsSchema,
};

const sessionAttemptRecordV3Fields = {
	schemaVersion: z.literal(STATE_GRADING_SESSION_SCHEMA_VERSION),
	...sessionAttemptRecordFields,
	...stateGradeFields,
	contextManifest: contextManifestSchema.optional(),
	divergences: z.array(manifestDivergenceSchema).optional(),
	readManifest: readManifestSchema.optional(),
	unavailableSubagents: unavailableSubagentsSchema,
};

export {
	sessionAttemptRecordFields,
	stateGradeFields,
	executionFailedSessionAttemptRecordFields,
	sessionAttemptRecordV3Fields,
};
