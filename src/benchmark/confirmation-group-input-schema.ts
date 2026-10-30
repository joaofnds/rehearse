import { z } from "zod";

import { effortSchema } from "./config";
import {
	MINIMUM_CONFIRMATION_REPS,
	callEvidenceSchema,
	identitySchema,
	lineageSchema,
} from "./confirmation-record-protocol";
import { corpusDeliverySchema } from "./corpus-delivery";
import corpusMeasurementSchema from "./corpus-measurement";

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
		path: z.string().nonempty(),
		sha256: z.string().regex(/^[0-9a-f]{64}$/u, "Invalid SHA-256 digest"),
	})
	.strict();

const frozenInputsSchema = z
	.object({
		corpusDelivery: corpusDeliverySchema.optional(),
		corpusVersion: corpusMeasurementSchema.optional(),
		effort: effortSchema.optional(),
		files: z.array(frozenFileSchema).nonempty(),
		judgeEffort: effortSchema.optional(),
		judgeModel: z.string().nonempty(),
		lineage: lineageSchema,
		model: z.string().nonempty(),
		pipelinePath: z.string().nonempty(),
		sessionBudgetUsd: z.number().positive(),
		setup: z.literal("actual").optional(),
		spendCeilingUsd: z.number().positive().optional(),
	})
	.strict();

const projectedCostSchema = z
	.object({
		perRepMaximumUsd: z.number().nonnegative(),
		reps: z.number().int().min(MINIMUM_CONFIRMATION_REPS),
		totalMaximumUsd: z.number().nonnegative(),
	})
	.strict();

const sessionFrozenFileSchema = z
	.object({
		kind: z.enum(["case", "fixture", "transcript", "corpus"]),
		path: z.string().nonempty(),
		sha256: z.string().regex(/^[0-9a-f]{64}$/u, "Invalid SHA-256 digest"),
	})
	.strict();

const sessionProjectedCostSchema = projectedCostSchema.extend({
	preflightMaximumUsd: z.number().nonnegative(),
});

const preflightEvidenceSchema = z.discriminatedUnion("status", [
	z
		.object({
			call: callEvidenceSchema.refine(({ role }) => role === "worker", {
				message: "Session preflight is a worker provider call",
			}),
			status: z.literal("COMPLETE"),
		})
		.strict(),
	z
		.object({ missing: z.string().nonempty(), status: z.literal("MISSING") })
		.strict(),
]);

const repRecordReferenceSchema = z
	.object({
		ordinal: z.number().int().positive(),
		path: z.string().nonempty(),
		repId: identitySchema,
	})
	.strict();

export {
	frozenInputsSchema,
	projectedCostSchema,
	sessionFrozenFileSchema,
	sessionProjectedCostSchema,
	preflightEvidenceSchema,
	repRecordReferenceSchema,
};
