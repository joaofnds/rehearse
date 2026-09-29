import { STAGE_LETTER_GRADES } from "#benchmark/config";
import type {
	ComparisonArm,
	ComparisonReport,
	LegacyComparisonReport,
} from "#benchmark/comparison-record";
import type { ReliabilitySummary } from "#benchmark/confirmation-report";
import { reliabilitySummaryNamed } from "#benchmark/confirmation-report";
import { armPairNames } from "./comparison-arm-pair";
import type {
	QualityReading,
	QualityScale,
	QualityVerdict,
} from "./comparison-quality-reading";
import type { MeterReading, WhatMovedRow } from "./comparison-what-moved";
import { meterReading } from "./comparison-what-moved";
import { NO_GRADED_REP_REASON } from "./confirmation-group-summary";
import type { Reading } from "./run-record";

type ReportCase = (ComparisonReport | LegacyComparisonReport)["cases"][number];

/**
 * How one arm's attempts compare with the other's over every combination of
 * one attempt from each, since no record ties an attempt of one arm to an
 * attempt of the other (doc-180 decision 1).
 */
export type AttemptCombinations = Reading<{
	readonly higher: number;
	readonly equal: number;
	readonly lower: number;
	readonly of: number;
}>;

export interface MeasureContrast {
	readonly verdict: QualityVerdict;
	readonly combinations: AttemptCombinations;
}

export interface CaseSummary {
	readonly contrasts: Readonly<
		Record<string, Readonly<Record<string, MeasureContrast>>>
	>;
	/** Arm B's reply length against arm A's. */
	readonly replyLength: MeterReading;
}

/** Each attempt's standing on the measure, higher for a better attempt. */
function standings(
	summary: ReliabilitySummary,
	scale: QualityScale,
): readonly number[] {
	if (scale === "successRate") {
		return [
			...Array.from({ length: summary.successful }, () => 1),
			...Array.from(
				{ length: summary.requested - summary.successful },
				() => 0,
			),
		];
	}

	return STAGE_LETTER_GRADES.flatMap((grade, index) =>
		Array.from(
			{ length: summary.gradeDistribution[grade] ?? 0 },
			() => STAGE_LETTER_GRADES.length - index,
		),
	);
}

function combinations(
	minuend: readonly number[],
	subtrahend: readonly number[],
): AttemptCombinations {
	if (minuend.length === 0 || subtrahend.length === 0) {
		return { state: "unavailable", reasons: [NO_GRADED_REP_REASON] };
	}

	let higher = 0;
	let lower = 0;
	for (const left of minuend) {
		for (const right of subtrahend) {
			if (left > right) {
				higher += 1;
			} else if (left < right) {
				lower += 1;
			}
		}
	}
	const of = minuend.length * subtrahend.length;

	return { state: "available", higher, equal: of - higher - lower, lower, of };
}

function measureContrast(
	benchmarkCase: ReportCase,
	arms: { readonly minuend: ComparisonArm; readonly subtrahend: ComparisonArm },
	measure: { readonly name: string; readonly scale: QualityScale },
	reading: QualityReading,
): MeasureContrast {
	const standingsOf = (arm: ComparisonArm): readonly number[] =>
		standings(
			reliabilitySummaryNamed(benchmarkCase.arms[arm].quality, measure.name),
			measure.scale,
		);

	return {
		verdict: reading.verdict,
		combinations: combinations(
			standingsOf(arms.minuend),
			standingsOf(arms.subtrahend),
		),
	};
}

function armBReplyLength(rows: readonly WhatMovedRow[]): MeterReading {
	for (const row of rows) {
		if (row.kind === "meter" && row.name === "replyLength") {
			return meterReading(row.arms.candidate, row.arms.baseline, {
				minuend: "candidate",
				subtrahend: "baseline",
			});
		}
	}
	throw new Error("What moved holds no reply length row");
}

/**
 * How arm B compares with arm A and each with the baseline arm, per overall
 * measure: the reading's verdict beside how the attempts compare.
 */
export function caseSummary(
	benchmarkCase: ReportCase,
	readings: {
		readonly quality: Readonly<
			Record<string, Readonly<Record<string, QualityReading>>>
		>;
		readonly whatMoved: readonly WhatMovedRow[];
	},
	scaleFor: (measure: string) => QualityScale,
): CaseSummary {
	return {
		contrasts: Object.fromEntries(
			Object.entries(readings.quality).map(([pair, byMeasure]) => [
				pair,
				Object.fromEntries(
					Object.entries(byMeasure).map(([name, reading]) => [
						name,
						measureContrast(
							benchmarkCase,
							armPairNames(pair),
							{ name, scale: scaleFor(name) },
							reading,
						),
					]),
				),
			]),
		),
		replyLength: armBReplyLength(readings.whatMoved),
	};
}
