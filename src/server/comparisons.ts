import type {
	ComparisonArm,
	ComparisonReport,
	LegacyComparisonReport,
} from "#benchmark/comparison-record";
import { reliabilitySummaryNamed } from "#benchmark/confirmation-report";
import type { ArmFigures, CaseArmFigures } from "./comparison-arm-figures";
import { armFigures } from "./comparison-arm-figures";
import { armPairs, pairKey } from "./comparison-arm-pair";
import type { CaseAttempts } from "./comparison-attempts";
import { comparisonAttempts } from "./comparison-attempts";
import type { ComparisonAttribution } from "./comparison-attribution";
import { comparisonAttribution } from "./comparison-attribution";
import type {
	QualityReading,
	QualityScale,
} from "./comparison-quality-reading";
import { qualityReading } from "./comparison-quality-reading";
import type { ComparisonAttemptHistoryLinks } from "./comparison-history-links";
import type { CaseSummary } from "./comparison-summary";
import { caseSummary } from "./comparison-summary";
import type { WhatMovedRow } from "./comparison-what-moved";
import { whatMoved } from "./comparison-what-moved";

export interface ComparisonReportWithAttribution {
	readonly report: ComparisonReport | LegacyComparisonReport;
	readonly attemptHistories: ComparisonAttemptHistoryLinks;
	readonly armFigures: Readonly<Record<string, CaseArmFigures>>;
	readonly attribution: Readonly<
		Record<string, Readonly<Record<string, ComparisonAttribution>>>
	>;
	readonly qualityReadings: Readonly<
		Record<
			string,
			Readonly<Record<string, Readonly<Record<string, QualityReading>>>>
		>
	>;
	readonly whatMoved: Readonly<Record<string, readonly WhatMovedRow[]>>;
	readonly attempts: Readonly<Record<string, CaseAttempts>>;
	readonly summary: Readonly<Record<string, CaseSummary>>;
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

function figuresByArm(
	report: AnyComparisonReport,
	benchmarkCase: AnyComparisonReport["cases"][number],
): CaseArmFigures {
	const figuresOf = (arm: ComparisonArm): ArmFigures =>
		armFigures(benchmarkCase.arms[arm], (measure) => scaleFor(report, measure));

	return {
		baseline: figuresOf("baseline"),
		candidate: figuresOf("candidate"),
		control: figuresOf("control"),
	};
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
	const figures: Record<string, CaseArmFigures> = {};
	const rows: Record<string, readonly WhatMovedRow[]> = {};
	const attempts: Record<string, CaseAttempts> = {};
	const summary: Record<string, CaseSummary> = {};
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
		const caseFigures = figuresByArm(report, benchmarkCase);
		figures[benchmarkCase.caseId] = caseFigures;
		attempts[benchmarkCase.caseId] = comparisonAttempts(benchmarkCase);
		const caseRows = whatMoved(
			benchmarkCase,
			caseFigures,
			qualityByPair,
			measures,
		);
		rows[benchmarkCase.caseId] = caseRows;
		summary[benchmarkCase.caseId] = caseSummary(
			benchmarkCase,
			{ quality: qualityByPair, whatMoved: caseRows },
			(measure) => scaleFor(report, measure),
		);
	}

	return {
		report,
		attemptHistories,
		armFigures: figures,
		attribution,
		qualityReadings,
		whatMoved: rows,
		attempts,
		summary,
	};
}
