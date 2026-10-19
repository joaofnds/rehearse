import type {
	ComparisonReport,
	LegacyComparisonReport,
} from "#benchmark/comparison-record";
import caseComparisonReading from "#server/comparison-case-reading";
import type { ComparisonAttemptHistoryLinks } from "#server/comparison-history-links";
import comparisonReadingIndex from "#server/comparison-reading-index";
import type { ComparisonReportWithAttribution } from "#server/comparison-report-contract";

/**
 * One attribution claim per case per arm pair, so the client renders the
 * refusal or the claim without recomputing `corpusDifferences` itself: the
 * dedup-by-path rule (`comparison-attribution.ts`) is a server-owned contract,
 * not something a browser re-derives from raw file lists. `qualityReadings`
 * is the same server-owned-contract rationale applied to the per-measure
 * interval and verdict (`comparison-quality-reading.ts`), keyed the same way
 * with one further level, the measure name.
 */
function comparisonReport(
	report: ComparisonReport | LegacyComparisonReport,
	attemptHistories: ComparisonAttemptHistoryLinks = {},
): ComparisonReportWithAttribution {
	const measures = [
		...report.declaredStages,
		...(report.mode === "pipeline" ? ["final"] : []),
	];
	const cases = report.cases.map((benchmarkCase) =>
		caseComparisonReading({ benchmarkCase, measures, report }),
	);
	const readings = comparisonReadingIndex(cases);

	return {
		armFigures: readings.armFigures,
		attemptHistories,
		attempts: readings.attempts,
		attribution: readings.attribution,
		qualityReadings: readings.qualityReadings,
		report,
		sessionAssessments: readings.sessionAssessments,
		summary: readings.summary,
		whatMoved: readings.whatMoved,
	};
}

export { comparisonReport as default };
export type { ComparisonReportWithAttribution } from "#server/comparison-report-contract";
