import { z } from "zod";

import comparisonReportJson from "./comparison-json";
import { COMPARISON_ARMS } from "./comparison-record-source-schema";
import type {
	currentPipelineComparisonReportSchema,
	currentSessionComparisonReportSchema,
	currentSingleCaseSessionComparisonReportSchema,
	currentSingleCaseStageComparisonReportSchema,
	currentStageComparisonReportSchema,
} from "./comparison-report-current-schema";
import { currentComparisonReportSchema } from "./comparison-report-current-schema";
import type { LegacyComparisonReport } from "./comparison-report-history-schema";
import {
	legacyComparisonReportSchema,
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
} from "./comparison-report-history-schema";
import validateArm from "./comparison-report-refinement";
import type { Immutable } from "./contracts";

const comparisonReportSchema = currentComparisonReportSchema.superRefine(
	(report, context) => {
		for (const [caseIndex, benchmarkCase] of report.cases.entries()) {
			for (const role of COMPARISON_ARMS) {
				validateArm(report, benchmarkCase.arms[role], {
					context,
					path: ["cases", caseIndex, "arms", role],
				});
			}
		}
	},
);

type ComparisonReport = Immutable<z.infer<typeof comparisonReportSchema>>;

type SingleCaseComparisonReport = Immutable<
	| z.infer<typeof currentSingleCaseSessionComparisonReportSchema>
	| z.infer<typeof currentSingleCaseStageComparisonReportSchema>
>;

type MultiCaseComparisonReport = Immutable<
	| z.infer<typeof currentStageComparisonReportSchema>
	| z.infer<typeof currentPipelineComparisonReportSchema>
	| z.infer<typeof currentSessionComparisonReportSchema>
>;

function parseComparisonReport(
	text: string,
): ComparisonReport | LegacyComparisonReport {
	return z
		.union([
			legacyComparisonReportSchema,
			versionTwoComparisonReportSchema,
			versionThreeSessionComparisonReportSchema,
			versionFourStageComparisonReportSchema,
			versionFourPipelineComparisonReportSchema,
			versionFourSessionComparisonReportSchema,
			versionFourSingleCaseSessionComparisonReportSchema,
			versionFiveStageComparisonReportSchema,
			versionFivePipelineComparisonReportSchema,
			versionFiveSessionComparisonReportSchema,
			versionFiveSingleCaseSessionComparisonReportSchema,
			versionFiveSingleCaseStageComparisonReportSchema,
			comparisonReportSchema,
		])
		.parse(JSON.parse(text));
}

function serializeComparisonReport(
	report: Immutable<ComparisonReport>,
): string {
	const parsed = comparisonReportSchema.parse(report);

	return `${comparisonReportJson(parsed)}\n`;
}

export {
	ComparisonManifestError,
	comparisonManifestSchema,
	parseComparisonManifest,
} from "./comparison-manifest";
export type {
	ComparisonManifest,
	ComparisonManifestText,
} from "./comparison-manifest";
export {
	COMPARISON_ARMS,
	ELAPSED_RESOURCES_REPORT_SCHEMA_VERSION,
	JUDGE_AGREEMENT_REPORT_SCHEMA_VERSION,
	LEGACY_REPORT_SCHEMA_VERSION,
	MULTIPLE_GROUPS_REPORT_SCHEMA_VERSION,
	RESOURCE_SUMMARIES_REPORT_SCHEMA_VERSION,
	SESSION_REPORT_SCHEMA_VERSION,
} from "./comparison-record-source-schema";
export type { ComparisonArm } from "./comparison-record-source-schema";
export type {
	LegacyComparisonReport,
	LegacySingleCaseComparisonReport,
} from "./comparison-report-history-schema";
export {
	comparisonReportSchema,
	parseComparisonReport,
	serializeComparisonReport,
};
export type {
	ComparisonReport,
	MultiCaseComparisonReport,
	SingleCaseComparisonReport,
};
