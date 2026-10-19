import type { SingleGroupSource } from "#benchmark/comparison-legacy-report-test-fixtures";
import {
	armResourcesWithoutElapsed,
	contrastResourcesWithoutElapsed,
	singleGroupSource,
} from "#benchmark/comparison-legacy-report-test-fixtures";
import type {
	LegacyComparisonReport,
	MultiCaseComparisonReport,
} from "#benchmark/comparison-record";
import { parseComparisonReport } from "#benchmark/comparison-record";

const RESOURCE_SUMMARY_COMPARISON_REPORT_VERSION = 4;
const ELAPSED_RESOURCE_COMPARISON_REPORT_VERSION = 5;
const MULTIPLE_GROUP_COMPARISON_REPORT_VERSION = 6;

type CurrentArm =
	MultiCaseComparisonReport["cases"][number]["arms"]["baseline"];
type ResourceSummaryReport = Extract<
	LegacyComparisonReport,
	{ readonly schemaVersion: typeof RESOURCE_SUMMARY_COMPARISON_REPORT_VERSION }
>;
type ElapsedResourceReport = Extract<
	LegacyComparisonReport,
	{ readonly schemaVersion: typeof ELAPSED_RESOURCE_COMPARISON_REPORT_VERSION }
>;

function singleGroupArm(arm: CurrentArm): Omit<CurrentArm, "source"> & {
	readonly source: SingleGroupSource<CurrentArm["source"]["reps"][number]>;
} {
	return { ...arm, source: singleGroupSource(arm.source) };
}

function armWithoutElapsed(
	arm: CurrentArm,
): ResourceSummaryReport["cases"][number]["arms"]["baseline"] {
	return {
		...singleGroupArm(arm),
		resources: armResourcesWithoutElapsed(arm.resources),
	};
}

function contrastWithoutElapsed(
	contrast: MultiCaseComparisonReport["contrasts"]["candidateMinusBaseline"],
): ResourceSummaryReport["contrasts"]["candidateMinusBaseline"] {
	return {
		...contrast,
		resources: contrastResourcesWithoutElapsed(contrast.resources),
	};
}

interface LegacyContrasts {
	readonly baselineMinusControl: ResourceSummaryReport["contrasts"]["baselineMinusControl"];
	readonly candidateMinusBaseline: ResourceSummaryReport["contrasts"]["candidateMinusBaseline"];
	readonly candidateMinusControl: ResourceSummaryReport["contrasts"]["candidateMinusControl"];
}

function legacyContrasts(report: MultiCaseComparisonReport): LegacyContrasts {
	return {
		baselineMinusControl: contrastWithoutElapsed(
			report.contrasts.baselineMinusControl,
		),
		candidateMinusBaseline: contrastWithoutElapsed(
			report.contrasts.candidateMinusBaseline,
		),
		candidateMinusControl: contrastWithoutElapsed(
			report.contrasts.candidateMinusControl,
		),
	};
}

function parseLegacyCandidate(text: string): LegacyComparisonReport {
	const parsed = parseComparisonReport(text);
	if (parsed.schemaVersion === MULTIPLE_GROUP_COMPARISON_REPORT_VERSION) {
		throw new Error("expected a legacy comparison report");
	}

	return parsed;
}

function resourceComparisonReport(
	report: MultiCaseComparisonReport,
): LegacyComparisonReport {
	const cases: ResourceSummaryReport["cases"] = report.cases.map(
		({ caseId, arms }) => ({
			arms: {
				baseline: armWithoutElapsed(arms.baseline),
				candidate: armWithoutElapsed(arms.candidate),
				control: armWithoutElapsed(arms.control),
			},
			caseId,
		}),
	);

	return parseLegacyCandidate(
		JSON.stringify({
			...report,
			cases,
			contrasts: legacyContrasts(report),
			schemaVersion: RESOURCE_SUMMARY_COMPARISON_REPORT_VERSION,
		}),
	);
}

function elapsedComparisonReport(
	report: MultiCaseComparisonReport,
): LegacyComparisonReport {
	const cases: ElapsedResourceReport["cases"] = report.cases.map(
		({ caseId, arms }) => ({
			arms: {
				baseline: singleGroupArm(arms.baseline),
				candidate: singleGroupArm(arms.candidate),
				control: singleGroupArm(arms.control),
			},
			caseId,
		}),
	);

	return parseLegacyCandidate(
		JSON.stringify({
			...report,
			cases,
			schemaVersion: ELAPSED_RESOURCE_COMPARISON_REPORT_VERSION,
		}),
	);
}

export {
	elapsedComparisonReport,
	legacyContrasts,
	parseLegacyCandidate,
	resourceComparisonReport,
};
