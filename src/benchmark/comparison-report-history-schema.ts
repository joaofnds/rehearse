import { z } from "zod";

import { MINIMUM_PAIRED_CASES } from "./comparison-estimator";
import {
	ELAPSED_RESOURCES_REPORT_SCHEMA_VERSION,
	JUDGE_AGREEMENT_REPORT_SCHEMA_VERSION,
	LEGACY_REPORT_SCHEMA_VERSION,
	NO_SESSION_JUDGE_BASELINES,
	RESOURCE_SUMMARIES_REPORT_SCHEMA_VERSION,
	SESSION_REPORT_SCHEMA_VERSION,
	comparisonModeSchema,
	sha256Schema,
} from "./comparison-record-source-schema";
import {
	reportCaseSchema,
	sessionReportCaseSchema,
	versionFiveReportCaseSchema,
	versionFiveSessionReportCaseSchema,
	versionFourReportCaseSchema,
	versionFourSessionReportCaseSchema,
} from "./comparison-report-arm-schema";
import {
	currentReportContrastSchema,
	reportContrastSchema,
} from "./comparison-report-metrics-schema";
import {
	currentSingleCaseReportContrastSchema,
	singleCaseReportContrastSchema,
} from "./comparison-report-single-case-schema";
import { MINIMUM_CONFIRMATION_REPS } from "./confirmation-record";
import type { Immutable } from "./contracts";
import { judgeAgreementReportSchema } from "./judge-agreement";

const comparisonReportFields = {
	cases: z.array(reportCaseSchema).min(MINIMUM_PAIRED_CASES),
	contrasts: z
		.object({
			baselineMinusControl: reportContrastSchema,
			candidateMinusBaseline: reportContrastSchema,
			candidateMinusControl: reportContrastSchema,
		})
		.strict(),
	declaredStages: z.array(z.string().nonempty()).nonempty(),
	manifest: z.object({ sha256: sha256Schema }).strict(),
	mode: comparisonModeSchema,
	reps: z.number().int().min(MINIMUM_CONFIRMATION_REPS),
};

const legacyComparisonReportSchema = z
	.object({
		schemaVersion: z.literal(LEGACY_REPORT_SCHEMA_VERSION),
		...comparisonReportFields,
	})
	.strict();

const versionTwoComparisonReportSchema = z
	.object({
		judgeAgreement: judgeAgreementReportSchema,
		schemaVersion: z.literal(JUDGE_AGREEMENT_REPORT_SCHEMA_VERSION),
		...comparisonReportFields,
	})
	.strict();

const sessionJudgeAgreementSchema = judgeAgreementReportSchema.extend({
	baselines: z.array(z.never()).length(NO_SESSION_JUDGE_BASELINES),
});

const versionThreeSessionComparisonReportSchema = z
	.object({
		judgeAgreement: sessionJudgeAgreementSchema,
		schemaVersion: z.literal(SESSION_REPORT_SCHEMA_VERSION),
		...comparisonReportFields,
		cases: z.array(sessionReportCaseSchema).min(MINIMUM_PAIRED_CASES),
		declaredStages: z.tuple([z.literal("checks")]),
		mode: z.literal("session"),
	})
	.strict();

const versionFourStageComparisonReportSchema = z
	.object({
		judgeAgreement: judgeAgreementReportSchema,
		schemaVersion: z.literal(RESOURCE_SUMMARIES_REPORT_SCHEMA_VERSION),
		...comparisonReportFields,
		cases: z.array(versionFourReportCaseSchema).min(MINIMUM_PAIRED_CASES),
		mode: z.literal("stage"),
	})
	.strict();

const versionFourPipelineComparisonReportSchema = z
	.object({
		judgeAgreement: judgeAgreementReportSchema,
		schemaVersion: z.literal(RESOURCE_SUMMARIES_REPORT_SCHEMA_VERSION),
		...comparisonReportFields,
		cases: z.array(versionFourReportCaseSchema).min(MINIMUM_PAIRED_CASES),
		mode: z.literal("pipeline"),
	})
	.strict();

const versionFourSessionComparisonReportSchema = z
	.object({
		judgeAgreement: sessionJudgeAgreementSchema,
		schemaVersion: z.literal(RESOURCE_SUMMARIES_REPORT_SCHEMA_VERSION),
		...comparisonReportFields,
		cases: z
			.array(versionFourSessionReportCaseSchema)
			.min(MINIMUM_PAIRED_CASES),
		declaredStages: z.tuple([z.literal("checks")]),
		mode: z.literal("session"),
	})
	.strict();

const versionFourSingleCaseSessionComparisonReportSchema = z
	.object({
		judgeAgreement: sessionJudgeAgreementSchema,
		schemaVersion: z.literal(RESOURCE_SUMMARIES_REPORT_SCHEMA_VERSION),
		...comparisonReportFields,
		cases: z.tuple([versionFourSessionReportCaseSchema]),
		contrasts: z
			.object({
				baselineMinusControl: singleCaseReportContrastSchema,
				candidateMinusBaseline: singleCaseReportContrastSchema,
				candidateMinusControl: singleCaseReportContrastSchema,
			})
			.strict(),
		declaredStages: z.tuple([z.literal("checks")]),
		mode: z.literal("session"),
		samplingUnit: z.literal("rep"),
	})
	.strict();

const versionFiveComparisonReportFields = {
	...comparisonReportFields,
	cases: z.array(versionFiveReportCaseSchema).min(MINIMUM_PAIRED_CASES),
	contrasts: z
		.object({
			baselineMinusControl: currentReportContrastSchema,
			candidateMinusBaseline: currentReportContrastSchema,
			candidateMinusControl: currentReportContrastSchema,
		})
		.strict(),
};

const versionFiveStageComparisonReportSchema = z
	.object({
		judgeAgreement: judgeAgreementReportSchema,
		schemaVersion: z.literal(ELAPSED_RESOURCES_REPORT_SCHEMA_VERSION),
		...versionFiveComparisonReportFields,
		mode: z.literal("stage"),
	})
	.strict();

const versionFivePipelineComparisonReportSchema = z
	.object({
		judgeAgreement: judgeAgreementReportSchema,
		schemaVersion: z.literal(ELAPSED_RESOURCES_REPORT_SCHEMA_VERSION),
		...versionFiveComparisonReportFields,
		mode: z.literal("pipeline"),
	})
	.strict();

const versionFiveSessionComparisonReportSchema = z
	.object({
		judgeAgreement: sessionJudgeAgreementSchema,
		schemaVersion: z.literal(ELAPSED_RESOURCES_REPORT_SCHEMA_VERSION),
		...versionFiveComparisonReportFields,
		cases: z
			.array(versionFiveSessionReportCaseSchema)
			.min(MINIMUM_PAIRED_CASES),
		declaredStages: z.tuple([z.literal("checks")]),
		mode: z.literal("session"),
	})
	.strict();

const versionFiveSingleCaseSessionComparisonReportSchema = z
	.object({
		judgeAgreement: sessionJudgeAgreementSchema,
		schemaVersion: z.literal(ELAPSED_RESOURCES_REPORT_SCHEMA_VERSION),
		...versionFiveComparisonReportFields,
		cases: z.tuple([versionFiveSessionReportCaseSchema]),
		contrasts: z
			.object({
				baselineMinusControl: currentSingleCaseReportContrastSchema,
				candidateMinusBaseline: currentSingleCaseReportContrastSchema,
				candidateMinusControl: currentSingleCaseReportContrastSchema,
			})
			.strict(),
		declaredStages: z.tuple([z.literal("checks")]),
		mode: z.literal("session"),
		samplingUnit: z.literal("rep"),
	})
	.strict();

const versionFiveSingleCaseStageComparisonReportSchema = z
	.object({
		judgeAgreement: judgeAgreementReportSchema,
		schemaVersion: z.literal(ELAPSED_RESOURCES_REPORT_SCHEMA_VERSION),
		...versionFiveComparisonReportFields,
		cases: z.tuple([versionFiveReportCaseSchema]),
		contrasts: z
			.object({
				baselineMinusControl: currentSingleCaseReportContrastSchema,
				candidateMinusBaseline: currentSingleCaseReportContrastSchema,
				candidateMinusControl: currentSingleCaseReportContrastSchema,
			})
			.strict(),
		mode: z.literal("stage"),
		samplingUnit: z.literal("rep"),
	})
	.strict();

type LegacyComparisonReport = Immutable<
	| z.infer<typeof legacyComparisonReportSchema>
	| z.infer<typeof versionTwoComparisonReportSchema>
	| z.infer<typeof versionThreeSessionComparisonReportSchema>
	| z.infer<typeof versionFourStageComparisonReportSchema>
	| z.infer<typeof versionFourPipelineComparisonReportSchema>
	| z.infer<typeof versionFourSessionComparisonReportSchema>
	| z.infer<typeof versionFourSingleCaseSessionComparisonReportSchema>
	| z.infer<typeof versionFiveStageComparisonReportSchema>
	| z.infer<typeof versionFivePipelineComparisonReportSchema>
	| z.infer<typeof versionFiveSessionComparisonReportSchema>
	| z.infer<typeof versionFiveSingleCaseSessionComparisonReportSchema>
	| z.infer<typeof versionFiveSingleCaseStageComparisonReportSchema>
>;

type LegacySingleCaseComparisonReport = Immutable<
	| z.infer<typeof versionFourSingleCaseSessionComparisonReportSchema>
	| z.infer<typeof versionFiveSingleCaseSessionComparisonReportSchema>
	| z.infer<typeof versionFiveSingleCaseStageComparisonReportSchema>
>;

export {
	comparisonReportFields,
	legacyComparisonReportSchema,
	sessionJudgeAgreementSchema,
	versionFivePipelineComparisonReportSchema,
	versionFiveSessionComparisonReportSchema,
	versionFiveSingleCaseSessionComparisonReportSchema,
	versionFiveSingleCaseStageComparisonReportSchema,
	versionFiveStageComparisonReportSchema,
	versionFourPipelineComparisonReportSchema,
	versionFourSessionComparisonReportSchema,
	versionFourSingleCaseSessionComparisonReportSchema,
	versionFourStageComparisonReportSchema,
	versionThreeSessionComparisonReportSchema,
	versionTwoComparisonReportSchema,
};
export type { LegacyComparisonReport, LegacySingleCaseComparisonReport };
