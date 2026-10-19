import {
	armResourcesWithoutElapsed,
	contrastResourcesWithoutElapsed,
	singleGroupSource,
} from "./comparison-legacy-report-test-fixtures";
import type {
	ComparisonReport,
	LegacyComparisonReport,
} from "./comparison-record";
import { COMPARISON_ARMS, parseComparisonReport } from "./comparison-record";
import { MULTIPLE_GROUP_COMPARISON_REPORT_VERSION } from "./session-comparison-test-contract";

type SavedReport = ComparisonReport | LegacyComparisonReport;

function asVersionThreeReport(report: SavedReport): SavedReport {
	if (
		report.schemaVersion !== MULTIPLE_GROUP_COMPARISON_REPORT_VERSION ||
		report.mode !== "session" ||
		"samplingUnit" in report
	) {
		throw new Error("expected a current multi-case session report");
	}

	const versionThreeReport = {
		...report,
		cases: report.cases.map(({ caseId, arms }) => ({
			arms: Object.fromEntries(
				COMPARISON_ARMS.map((role) => [
					role,
					{
						...arms[role],
						resources: armResourcesWithoutElapsed(arms[role].resources),
						source: {
							group: singleGroupSource(arms[role].source).group,
							reps: singleGroupSource(arms[role].source).reps.map(
								({
									outcomes: _outcomes,
									checks: _checks,
									stateResults: _stateResults,
									words: _words,
									...rep
								}) => rep,
							),
						},
					},
				]),
			),
			caseId,
		})),
		contrasts: Object.fromEntries(
			Object.entries(report.contrasts).map(([pair, contrast]) => [
				pair,
				{
					...contrast,
					resources: contrastResourcesWithoutElapsed(contrast.resources),
				},
			]),
		),
		schemaVersion: 3,
	};

	return parseComparisonReport(JSON.stringify(versionThreeReport));
}

export { asVersionThreeReport as default };
