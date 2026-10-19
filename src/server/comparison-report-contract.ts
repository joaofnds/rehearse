import type {
	ComparisonReport,
	LegacyComparisonReport,
} from "#benchmark/comparison-record";
import type { CaseArmFigures } from "#server/comparison-arm-figures";
import type { CaseAttempts } from "#server/comparison-attempts";
import type { ComparisonAttribution } from "#server/comparison-attribution";
import type { ComparisonAttemptHistoryLinks } from "#server/comparison-history-links";
import type { QualityReading } from "#server/comparison-quality-reading";
import type { SessionComparisonAssessment } from "#server/comparison-session-assessment";
import type { CaseSummary } from "#server/comparison-summary";
import type { WhatMovedRow } from "#server/comparison-what-moved-contract";

interface ComparisonReportWithAttribution {
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
	readonly sessionAssessments?: Readonly<
		Record<string, SessionComparisonAssessment>
	>;
}

type AnyComparisonReport = ComparisonReport | LegacyComparisonReport;

export type { ComparisonReportWithAttribution, AnyComparisonReport };
