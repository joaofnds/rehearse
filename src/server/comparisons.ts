import type {
	ComparisonArm,
	ComparisonReport,
	LegacyComparisonReport,
} from "#benchmark/comparison-record";
import { reliabilitySummaryNamed } from "#benchmark/confirmation-report";
import { armPairs, pairKey } from "./comparison-arm-pair";
import type { ComparisonAttribution } from "./comparison-attribution";
import { comparisonAttribution } from "./comparison-attribution";
import type {
	QualityReading,
	QualityScale,
} from "./comparison-quality-reading";
import { qualityReading } from "./comparison-quality-reading";
import type { ComparisonAttemptHistoryLinks } from "./comparison-history-links";

export interface ComparisonReportWithAttribution {
	readonly report: ComparisonReport | LegacyComparisonReport;
	readonly attemptHistories: ComparisonAttemptHistoryLinks;
	readonly attribution: Readonly<
		Record<string, Readonly<Record<string, ComparisonAttribution>>>
	>;
	readonly qualityReadings: Readonly<
		Record<
			string,
			Readonly<Record<string, Readonly<Record<string, QualityReading>>>>
		>
	>;
}

type AnyComparisonReport = ComparisonReport | LegacyComparisonReport;

function scaleFor(report: AnyComparisonReport, measure: string): QualityScale {
	return report.mode === "session" || measure === "final"
		? "successRate"
		: "letters";
}

function qualityReadingsByMeasure(
	report: AnyComparisonReport,
	benchmarkCase: AnyComparisonReport["cases"][number],
	minuend: ComparisonArm,
	subtrahend: ComparisonArm,
	measures: readonly string[],
): Readonly<Record<string, QualityReading>> {
	return Object.fromEntries(
		measures.map((name) => [
			name,
			qualityReading({
				minuend: reliabilitySummaryNamed(
					benchmarkCase.arms[minuend].quality,
					name,
				),
				subtrahend: reliabilitySummaryNamed(
					benchmarkCase.arms[subtrahend].quality,
					name,
				),
				minuendArm: minuend,
				subtrahendArm: subtrahend,
				scale: scaleFor(report, name),
			}),
		]),
	);
}

/**
 * One attribution claim per case per arm pair, so the client renders the
 * refusal or the claim without recomputing `corpusDifferences` itself: the
 * dedup-by-path rule (`comparison-attribution.ts`) is a server-owned contract,
 * not something a browser re-derives from raw file lists. `qualityReadings`
 * is the same server-owned-contract rationale applied to the per-measure
 * interval and verdict (`comparison-quality-reading.ts`), keyed the same way
 * with one further level, the measure name.
 */
export function comparisonReport(
	report: ComparisonReport | LegacyComparisonReport,
	attemptHistories: ComparisonAttemptHistoryLinks = {},
): ComparisonReportWithAttribution {
	const attribution: Record<string, Record<string, ComparisonAttribution>> = {};
	const qualityReadings: Record<
		string,
		Record<string, Record<string, QualityReading>>
	> = {};
	const measures = [
		...report.declaredStages,
		...(report.mode === "pipeline" ? ["final"] : []),
	];

	for (const benchmarkCase of report.cases) {
		const byPair: Record<string, ComparisonAttribution> = {};
		const qualityByPair: Record<string, Record<string, QualityReading>> = {};
		for (const { minuend, subtrahend } of armPairs()) {
			const pair = pairKey(minuend, subtrahend);
			byPair[pair] = comparisonAttribution(
				benchmarkCase.arms[minuend].executedCorpus,
				benchmarkCase.arms[subtrahend].executedCorpus,
				report.mode,
			);
			qualityByPair[pair] = qualityReadingsByMeasure(
				report,
				benchmarkCase,
				minuend,
				subtrahend,
				measures,
			);
		}

		attribution[benchmarkCase.caseId] = byPair;
		qualityReadings[benchmarkCase.caseId] = qualityByPair;
	}

	return { report, attemptHistories, attribution, qualityReadings };
}
