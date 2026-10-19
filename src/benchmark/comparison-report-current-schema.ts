import { z } from "zod";

import { MINIMUM_PAIRED_CASES } from "./comparison-estimator";
import type { ComparisonArm } from "./comparison-record-source-schema";
import { MULTIPLE_GROUPS_REPORT_SCHEMA_VERSION } from "./comparison-record-source-schema";
import {
	currentReportCaseSchema,
	currentSessionReportCaseSchema,
} from "./comparison-report-arm-schema";
import {
	comparisonReportFields,
	sessionJudgeAgreementSchema,
} from "./comparison-report-history-schema";
import { currentReportContrastSchema } from "./comparison-report-metrics-schema";
import { currentSingleCaseReportContrastSchema } from "./comparison-report-single-case-schema";
import type { Immutable } from "./contracts";
import { judgeAgreementReportSchema } from "./judge-agreement";

const currentComparisonReportFields = {
	...comparisonReportFields,
	cases: z.array(currentReportCaseSchema).min(MINIMUM_PAIRED_CASES),
	contrasts: z
		.object({
			baselineMinusControl: currentReportContrastSchema,
			candidateMinusBaseline: currentReportContrastSchema,
			candidateMinusControl: currentReportContrastSchema,
		})
		.strict(),
};

const currentStageComparisonReportSchema = z
	.object({
		judgeAgreement: judgeAgreementReportSchema,
		schemaVersion: z.literal(MULTIPLE_GROUPS_REPORT_SCHEMA_VERSION),
		...currentComparisonReportFields,
		mode: z.literal("stage"),
	})
	.strict();

const currentPipelineComparisonReportSchema = z
	.object({
		judgeAgreement: judgeAgreementReportSchema,
		schemaVersion: z.literal(MULTIPLE_GROUPS_REPORT_SCHEMA_VERSION),
		...currentComparisonReportFields,
		mode: z.literal("pipeline"),
	})
	.strict();

const currentSessionComparisonReportSchema = z
	.object({
		judgeAgreement: sessionJudgeAgreementSchema,
		schemaVersion: z.literal(MULTIPLE_GROUPS_REPORT_SCHEMA_VERSION),
		...currentComparisonReportFields,
		cases: z.array(currentSessionReportCaseSchema).min(MINIMUM_PAIRED_CASES),
		declaredStages: z.tuple([z.literal("checks")]),
		mode: z.literal("session"),
	})
	.strict();

const currentSingleCaseSessionComparisonReportSchema = z
	.object({
		judgeAgreement: sessionJudgeAgreementSchema,
		schemaVersion: z.literal(MULTIPLE_GROUPS_REPORT_SCHEMA_VERSION),
		...currentComparisonReportFields,
		cases: z.tuple([currentSessionReportCaseSchema]),
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

const currentSingleCaseStageComparisonReportSchema = z
	.object({
		judgeAgreement: judgeAgreementReportSchema,
		schemaVersion: z.literal(MULTIPLE_GROUPS_REPORT_SCHEMA_VERSION),
		...currentComparisonReportFields,
		cases: z.tuple([currentReportCaseSchema]),
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

const currentComparisonReportSchema = z.union([
	currentStageComparisonReportSchema,
	currentPipelineComparisonReportSchema,
	currentSessionComparisonReportSchema,
	currentSingleCaseSessionComparisonReportSchema,
	currentSingleCaseStageComparisonReportSchema,
]);

type CurrentComparisonReport = Immutable<
	z.infer<typeof currentComparisonReportSchema>
>;

type CurrentReportArm =
	CurrentComparisonReport["cases"][number]["arms"][ComparisonArm];

type CurrentRepOutcome =
	CurrentReportArm["source"]["reps"][number]["outcomes"][number];

type CurrentJudgedRepOutcome = Extract<
	CurrentRepOutcome,
	{ readonly status: "JUDGED" }
>;

export {
	currentComparisonReportSchema,
	currentPipelineComparisonReportSchema,
	currentSessionComparisonReportSchema,
	currentSingleCaseSessionComparisonReportSchema,
	currentSingleCaseStageComparisonReportSchema,
	currentStageComparisonReportSchema,
};
export type {
	CurrentComparisonReport,
	CurrentJudgedRepOutcome,
	CurrentReportArm,
};
