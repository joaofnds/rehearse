import { z } from "zod";

import { MINIMUM_PAIRED_CASES } from "./comparison-estimator";
import {
	MAXIMUM_RATE,
	MINIMUM_RATE,
	NO_MISSING_METRIC_REPS,
	comparisonArmSchema,
	identitySchema,
} from "./comparison-record-source-schema";

const reliabilitySummarySchema = z
	.object({
		attempted: z.number().int().nonnegative(),
		failed: z.number().int().nonnegative(),
		gradeDistribution: z.record(
			z.string().nonempty(),
			z.number().int().nonnegative(),
		),
		name: z.string().nonempty(),
		notReached: z.number().int().nonnegative(),
		passK: z.number().min(MINIMUM_RATE).max(MAXIMUM_RATE),
		requested: z.number().int().positive(),
		standardError: z.number().nonnegative(),
		successRate: z.number().min(MINIMUM_RATE).max(MAXIMUM_RATE),
		successful: z.number().int().nonnegative(),
	})
	.strict();

const caseDeltaSchema = z
	.object({ caseId: identitySchema, value: z.number() })
	.strict();

const pairedEstimateSchema = z
	.object({
		caseDeltas: z.array(caseDeltaSchema).min(MINIMUM_PAIRED_CASES),
		meanDelta: z.number(),
		standardError: z.number().nonnegative(),
	})
	.strict();

const metricValueSummarySchema = z
	.object({
		mean: z.number().nonnegative(),
		values: z.array(z.number().nonnegative()).nonempty(),
	})
	.strict();

const resourceMetricSummarySchema = z
	.object({
		cacheReadTokens: metricValueSummarySchema,
		cacheWriteTokens: metricValueSummarySchema,
		costUsd: metricValueSummarySchema,
		inputTokens: metricValueSummarySchema,
		outputTokens: metricValueSummarySchema,
	})
	.strict();

const resourceRolesSummarySchema = z
	.object({
		"final-judge": resourceMetricSummarySchema,
		"product-owner": resourceMetricSummarySchema,
		"stage-judge": resourceMetricSummarySchema,
		worker: resourceMetricSummarySchema,
	})
	.strict();

const missingResourceEvidenceSchema = z
	.object({
		missing: z.array(z.string().nonempty()).nonempty(),
		ordinal: z.number().int().positive(),
		repId: identitySchema,
	})
	.strict();

const armResourcesSchema = z.discriminatedUnion("status", [
	z
		.object({
			completeReps: z.number().int().positive(),
			missingMetricReps: z.literal(NO_MISSING_METRIC_REPS),
			perRole: resourceRolesSummarySchema,
			status: z.literal("AVAILABLE"),
			total: resourceMetricSummarySchema,
			workerTurns: metricValueSummarySchema,
		})
		.strict(),
	z
		.object({
			completeReps: z.number().int().nonnegative(),
			missingEvidence: z.array(missingResourceEvidenceSchema).nonempty(),
			missingMetricReps: z.number().int().positive(),
			status: z.literal("UNAVAILABLE"),
		})
		.strict(),
]);

const currentArmResourcesSchema = z.discriminatedUnion("status", [
	z
		.object({
			completeReps: z.number().int().positive(),
			elapsedMs: metricValueSummarySchema,
			missingMetricReps: z.literal(NO_MISSING_METRIC_REPS),
			perRole: resourceRolesSummarySchema,
			status: z.literal("AVAILABLE"),
			total: resourceMetricSummarySchema,
			workerTurns: metricValueSummarySchema,
		})
		.strict(),
	z
		.object({
			completeReps: z.number().int().nonnegative(),
			missingEvidence: z.array(missingResourceEvidenceSchema).nonempty(),
			missingMetricReps: z.number().int().positive(),
			status: z.literal("UNAVAILABLE"),
		})
		.strict(),
]);

const qualityContrastSchema = z
	.object({
		name: z.string().nonempty(),
		passK: pairedEstimateSchema,
		successRate: pairedEstimateSchema,
	})
	.strict();

const resourceMetricEstimatesSchema = z
	.object({
		cacheReadTokens: pairedEstimateSchema,
		cacheWriteTokens: pairedEstimateSchema,
		costUsd: pairedEstimateSchema,
		inputTokens: pairedEstimateSchema,
		outputTokens: pairedEstimateSchema,
	})
	.strict();

const resourceRolesEstimatesSchema = z
	.object({
		"final-judge": resourceMetricEstimatesSchema,
		"product-owner": resourceMetricEstimatesSchema,
		"stage-judge": resourceMetricEstimatesSchema,
		worker: resourceMetricEstimatesSchema,
	})
	.strict();

const caseMissingResourceEvidenceSchema = missingResourceEvidenceSchema
	.extend({ arm: comparisonArmSchema, caseId: identitySchema })
	.strict();

const contrastResourcesSchema = z.discriminatedUnion("status", [
	z
		.object({
			perRole: resourceRolesEstimatesSchema,
			status: z.literal("AVAILABLE"),
			total: resourceMetricEstimatesSchema,
			workerTurns: pairedEstimateSchema,
		})
		.strict(),
	z
		.object({
			missingEvidence: z.array(caseMissingResourceEvidenceSchema).nonempty(),
			status: z.literal("UNAVAILABLE"),
		})
		.strict(),
]);

const currentContrastResourcesSchema = z.discriminatedUnion("status", [
	z
		.object({
			elapsedMs: pairedEstimateSchema,
			perRole: resourceRolesEstimatesSchema,
			status: z.literal("AVAILABLE"),
			total: resourceMetricEstimatesSchema,
			workerTurns: pairedEstimateSchema,
		})
		.strict(),
	z
		.object({
			missingEvidence: z.array(caseMissingResourceEvidenceSchema).nonempty(),
			status: z.literal("UNAVAILABLE"),
		})
		.strict(),
]);

const reportContrastSchema = z
	.object({
		minuend: comparisonArmSchema,
		quality: z.array(qualityContrastSchema).nonempty(),
		resources: contrastResourcesSchema,
		subtrahend: comparisonArmSchema,
	})
	.strict();

const currentReportContrastSchema = reportContrastSchema
	.extend({ resources: currentContrastResourcesSchema })
	.strict();

export {
	armResourcesSchema,
	caseMissingResourceEvidenceSchema,
	currentArmResourcesSchema,
	currentReportContrastSchema,
	reliabilitySummarySchema,
	reportContrastSchema,
};
