import { z } from "zod";

import {
	MAXIMUM_RATE,
	MAXIMUM_RATE_DELTA,
	MINIMUM_RATE,
	MINIMUM_RATE_DELTA,
	comparisonArmSchema,
} from "./comparison-record-source-schema";
import { caseMissingResourceEvidenceSchema } from "./comparison-report-metrics-schema";

const proportionIntervalSchema = z
	.object({
		high: z.number().min(MINIMUM_RATE).max(MAXIMUM_RATE),
		low: z.number().min(MINIMUM_RATE).max(MAXIMUM_RATE),
	})
	.strict();

const singleCaseArmProportionSchema = z
	.object({
		interval: proportionIntervalSchema,
		rate: z.number().min(MINIMUM_RATE).max(MAXIMUM_RATE),
		requested: z.number().int().positive(),
		successful: z.number().int().nonnegative(),
	})
	.strict();

const singleCaseProportionEstimateSchema = z
	.object({
		delta: z.number().min(MINIMUM_RATE_DELTA).max(MAXIMUM_RATE_DELTA),
		minuend: singleCaseArmProportionSchema,
		standardError: z.number().nonnegative(),
		subtrahend: singleCaseArmProportionSchema,
	})
	.strict();

const singleCasePassKSchema = z
	.object({
		delta: z.number().min(MINIMUM_RATE_DELTA).max(MAXIMUM_RATE_DELTA),
		minuend: z.number().min(MINIMUM_RATE).max(MAXIMUM_RATE),
		subtrahend: z.number().min(MINIMUM_RATE).max(MAXIMUM_RATE),
	})
	.strict();

const singleCaseQualityContrastSchema = z
	.object({
		name: z.string().nonempty(),
		passK: singleCasePassKSchema,
		successRate: singleCaseProportionEstimateSchema,
	})
	.strict();

const singleCaseSpreadSchema = z.discriminatedUnion("status", [
	z.object({ status: z.literal("NO_OBSERVED_SPREAD") }).strict(),
	z
		.object({
			standardError: z.number().nonnegative(),
			status: z.literal("ESTIMATED"),
		})
		.strict(),
]);

const singleCaseArmMeanSchema = z
	.object({
		mean: z.number().nonnegative(),
		values: z.array(z.number().nonnegative()).nonempty(),
	})
	.strict();

const singleCaseMeanEstimateSchema = z
	.object({
		delta: z.number(),
		minuend: singleCaseArmMeanSchema,
		spread: singleCaseSpreadSchema,
		subtrahend: singleCaseArmMeanSchema,
	})
	.strict();

const singleCaseResourceMetricEstimatesSchema = z
	.object({
		cacheReadTokens: singleCaseMeanEstimateSchema,
		cacheWriteTokens: singleCaseMeanEstimateSchema,
		costUsd: singleCaseMeanEstimateSchema,
		inputTokens: singleCaseMeanEstimateSchema,
		outputTokens: singleCaseMeanEstimateSchema,
	})
	.strict();

const singleCaseResourceRolesEstimatesSchema = z
	.object({
		"final-judge": singleCaseResourceMetricEstimatesSchema,
		"product-owner": singleCaseResourceMetricEstimatesSchema,
		"stage-judge": singleCaseResourceMetricEstimatesSchema,
		worker: singleCaseResourceMetricEstimatesSchema,
	})
	.strict();

const singleCaseContrastResourcesSchema = z.discriminatedUnion("status", [
	z
		.object({
			perRole: singleCaseResourceRolesEstimatesSchema,
			status: z.literal("AVAILABLE"),
			total: singleCaseResourceMetricEstimatesSchema,
			workerTurns: singleCaseMeanEstimateSchema,
		})
		.strict(),
	z
		.object({
			missingEvidence: z.array(caseMissingResourceEvidenceSchema).nonempty(),
			status: z.literal("UNAVAILABLE"),
		})
		.strict(),
]);

const currentSingleCaseContrastResourcesSchema = z.discriminatedUnion(
	"status",
	[
		z
			.object({
				elapsedMs: singleCaseMeanEstimateSchema,
				perRole: singleCaseResourceRolesEstimatesSchema,
				status: z.literal("AVAILABLE"),
				total: singleCaseResourceMetricEstimatesSchema,
				workerTurns: singleCaseMeanEstimateSchema,
			})
			.strict(),
		z
			.object({
				missingEvidence: z.array(caseMissingResourceEvidenceSchema).nonempty(),
				status: z.literal("UNAVAILABLE"),
			})
			.strict(),
	],
);

const singleCaseReportContrastSchema = z
	.object({
		minuend: comparisonArmSchema,
		quality: z.array(singleCaseQualityContrastSchema).nonempty(),
		resources: singleCaseContrastResourcesSchema,
		subtrahend: comparisonArmSchema,
	})
	.strict();

const currentSingleCaseReportContrastSchema = singleCaseReportContrastSchema
	.extend({ resources: currentSingleCaseContrastResourcesSchema })
	.strict();

export {
	currentSingleCaseReportContrastSchema,
	singleCaseReportContrastSchema,
};
