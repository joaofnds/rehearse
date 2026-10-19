import { z } from "zod";

import { APPROVAL_METHODS, effortSchema } from "./config";
import {
	frozenInputsSchema,
	preflightEvidenceSchema,
	projectedCostSchema,
	repRecordReferenceSchema,
	sessionFrozenFileSchema,
	sessionProjectedCostSchema,
} from "./confirmation-group-input-schema";
import {
	MINIMUM_CONFIRMATION_REPS,
	PIPELINE_CONFIRMATION_SCHEMA_VERSION,
	SESSION_CONFIRMATION_SCHEMA_VERSION,
	confirmationModeSchema,
	elapsedSchema,
	identitySchema,
	legacyCaseIdSchema,
} from "./confirmation-record-protocol";
import corpusMeasurementSchema from "./corpus-measurement";
import { startedAtSchema } from "./recorded-time";

const ORDINAL_BASE = 1;

const BUDGET_SIGNIFICANT_DIGITS = 15;

const legacyConfirmationGroupRecordFields = {
	approval: z
		.object({
			approved: z.literal(true),
			method: z.enum(APPROVAL_METHODS),
		})
		.strict(),
	caseId: legacyCaseIdSchema,
	declaredStages: z.array(z.string().nonempty()).nonempty(),
	groupId: identitySchema,
	inputs: frozenInputsSchema,
	makespanMs: elapsedSchema,
	mode: confirmationModeSchema,
	projectedCost: projectedCostSchema,
	repRecords: z.array(repRecordReferenceSchema),
	reportFile: z.string().nonempty(),
	reps: z.number().int().min(MINIMUM_CONFIRMATION_REPS),
	schemaVersion: z.literal(PIPELINE_CONFIRMATION_SCHEMA_VERSION),
};

interface RecordedGroup {
	readonly groupId: string;
	readonly reps: number;
	readonly repRecords: readonly {
		readonly repId: string;
		readonly ordinal: number;
	}[];
	readonly projectedCost: { readonly reps: number };
}

interface GroupRefinementContext {
	readonly addIssue: z.RefinementCtx["addIssue"];
}

function refineGroupRecord(
	record: RecordedGroup,
	context: Readonly<GroupRefinementContext>,
): void {
	const referencesEveryRep =
		record.repRecords.length === record.reps &&
		record.repRecords.every(
			(reference, index) =>
				reference.ordinal === index + ORDINAL_BASE &&
				reference.repId === `${record.groupId}-rep-${index + ORDINAL_BASE}`,
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
}

interface RecordedSessionGroup extends RecordedGroup {
	readonly projectedCost: {
		readonly reps: number;
		readonly preflightMaximumUsd: number;
		readonly perRepMaximumUsd: number;
		readonly totalMaximumUsd: number;
	};
}

function refineSessionGroupRecord(
	record: RecordedSessionGroup,
	context: Readonly<GroupRefinementContext>,
): void {
	refineGroupRecord(record, context);
	const expectedTotal = Number(
		(
			record.projectedCost.preflightMaximumUsd +
			record.reps * record.projectedCost.perRepMaximumUsd
		).toPrecision(BUDGET_SIGNIFICANT_DIGITS),
	);
	if (record.projectedCost.totalMaximumUsd !== expectedTotal) {
		context.addIssue({
			code: "custom",
			message:
				"Session projected total must equal preflight plus every rep maximum",
			path: ["projectedCost", "totalMaximumUsd"],
		});
	}
}

const legacyConfirmationGroupRecordSchema = z
	.object({
		...legacyConfirmationGroupRecordFields,
		startedAt: startedAtSchema.optional(),
	})
	.strict()
	.superRefine(refineGroupRecord);

const sessionConfirmationGroupRecordFields = {
	approval: z
		.object({
			approved: z.literal(true),
			method: z.enum(APPROVAL_METHODS),
		})
		.strict(),
	caseId: identitySchema,
	declaredStages: z.tuple([z.literal("checks")]),
	groupId: identitySchema,
	inputs: z
		.object({
			corpusVersion: corpusMeasurementSchema.optional(),
			effort: effortSchema.optional(),
			files: z.array(sessionFrozenFileSchema).nonempty(),
			judgeEffort: z.never().optional(),
			judgeModel: z.never().optional(),
			lineage: z
				.object({ kind: z.literal("SESSION"), lineage: z.string().nonempty() })
				.strict(),
			model: z.string().nonempty(),
			pipelinePath: z.never().optional(),
			sessionBudgetUsd: z.number().positive(),
			spendCeilingUsd: z.number().positive().optional(),
		})
		.strict(),
	makespanMs: elapsedSchema,
	mode: z.literal("session"),
	preflight: preflightEvidenceSchema,
	projectedCost: sessionProjectedCostSchema,
	repRecords: z.array(repRecordReferenceSchema),
	reportFile: z.string().nonempty(),
	reps: z.number().int().min(MINIMUM_CONFIRMATION_REPS),
	schemaVersion: z.literal(SESSION_CONFIRMATION_SCHEMA_VERSION),
};

const sessionConfirmationGroupRecordSchema = z
	.object({
		...sessionConfirmationGroupRecordFields,
		startedAt: startedAtSchema.optional(),
	})
	.strict()
	.superRefine(refineSessionGroupRecord);

const writableConfirmationGroupRecordSchema = z
	.object({
		...legacyConfirmationGroupRecordFields,
		startedAt: startedAtSchema,
	})
	.strict()
	.superRefine(refineGroupRecord);

const writableSessionConfirmationGroupRecordSchema = z
	.object({
		...sessionConfirmationGroupRecordFields,
		startedAt: startedAtSchema,
	})
	.strict()
	.superRefine(refineSessionGroupRecord);

export {
	legacyConfirmationGroupRecordSchema,
	sessionConfirmationGroupRecordSchema,
	writableConfirmationGroupRecordSchema,
	writableSessionConfirmationGroupRecordSchema,
};
