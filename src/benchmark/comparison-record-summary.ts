import type {
	ComparisonReport,
	LegacyComparisonReport,
	LegacySingleCaseComparisonReport,
	SingleCaseComparisonReport,
} from "./comparison-record";
import {
	pairedSummaryRows,
	singleCaseSummaryRows,
} from "./comparison-summary-rows";
import type { Immutable } from "./contracts";
import { table } from "./record-summary-format";

function singleCaseComparisonSummary(
	digest: string,
	report: Immutable<
		SingleCaseComparisonReport | LegacySingleCaseComparisonReport
	>,
): string {
	const [benchmarkCase] = report.cases;
	if (benchmarkCase === undefined) {
		throw new Error("A single-case comparison report carries no case");
	}

	const { armRows, contrastRows, resourceRows } = singleCaseSummaryRows(report);

	return [
		`## comparison:${digest}`,
		"",
		`1 case, ${report.mode} mode, ${String(report.reps)} reps.`,
		"",
		`Sampling unit: ${report.samplingUnit}. Arms are independent samples; this estimate covers case ${benchmarkCase.caseId} only.`,
		"",
		...table(
			["arm", "successful", "success rate", "95% interval", "pass^k"],
			armRows,
		),
		"",
		...table(
			["contrast", "outcome", "success rate Δ", "standard error", "pass^k Δ"],
			contrastRows,
		),
		"",
		...table(
			[
				"contrast",
				"cost Δ",
				"standard error",
				"per-attempt elapsed Δ (ms)",
				"standard error",
			],
			resourceRows,
		),
		"",
	].join("\n");
}

function comparisonSummary(
	digest: string,
	report: Immutable<ComparisonReport | LegacyComparisonReport>,
): string {
	if ("samplingUnit" in report) {
		return singleCaseComparisonSummary(digest, report);
	}

	const { rows, costRows } = pairedSummaryRows(report);

	return [
		`## comparison:${digest}`,
		"",
		`${String(report.cases.length)} cases, ${report.mode} mode, ${String(report.reps)} reps.`,
		"",
		...table(
			[
				"contrast",
				"outcome",
				"success rate Δ",
				"standard error",
				"pass^k Δ",
				"per-case Δ",
				"reading",
			],
			rows,
		),
		"",
		...table(
			["contrast", "cost Δ (USD)", "standard error", "per-case Δ"],
			costRows,
		),
		"",
	].join("\n");
}

export { comparisonSummary as default };
