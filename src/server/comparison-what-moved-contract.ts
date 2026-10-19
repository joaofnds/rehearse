import type {
	ComparisonArm,
	ComparisonReport,
	LegacyComparisonReport,
} from "#benchmark/comparison-record";
import type { MeasureFigure } from "#server/comparison-arm-figures";
import type {
	QualityReading,
	QualityVerdict,
} from "#server/comparison-quality-reading";
import type { LetterRange } from "#server/confirmation-group-summary";
import type { Reading } from "#server/run-record";

type AnyComparisonReport = ComparisonReport | LegacyComparisonReport;

type ReportCase = AnyComparisonReport["cases"][number];

type ReportArm = ReportCase["arms"][ComparisonArm];

type ReportRep = ReportArm["source"]["reps"][number];

interface ByArm<Value> {
	readonly baseline: Value;
	readonly candidate: Value;
	readonly control: Value;
}

type ByPair<Value> = Readonly<Record<string, Value>>;

interface Firings {
	readonly fired: number;
	readonly of: number;
}

/** The observed low and high of a per-attempt quantity, beside its mean. */
interface MeterSpread {
	readonly mean: number;
	readonly low: number;
	readonly high: number;
	readonly counted: number;
}

/** A blocker or dimension reading, which one arm's missing grading voids. */
interface ItemReading {
	readonly interval: QualityReading["interval"];
	readonly verdict: QualityVerdict;
}

/**
 * A meter is neither better nor worse higher up, so its verdict names the
 * arm that ran higher rather than the arm that did better. It does so only
 * when the arms' ranges are disjoint and that separation is unlikely under
 * rerun noise: with exchangeable attempts, full separation in either
 * direction has probability 2 / C(n + m, n), so two attempts an arm never
 * name one higher. `change` is the minuend's mean against the subtrahend's,
 * as a signed percentage.
 */
interface MeterReading {
	readonly interval: {
		readonly minuend:
			| { readonly low: number; readonly high: number }
			| undefined;
		readonly subtrahend:
			| { readonly low: number; readonly high: number }
			| undefined;
	};
	readonly change: string | undefined;
	readonly verdict:
		| { readonly kind: "insideRerunNoise" }
		| { readonly kind: "unavailable"; readonly reasons: readonly string[] }
		| { readonly kind: "higher"; readonly arm: ComparisonArm };
}

type WhatMovedRow =
	| {
			readonly kind: "overall";
			readonly name: string;
			readonly arms: ByArm<MeasureFigure | undefined>;
			readonly readings: ByPair<QualityReading>;
	  }
	| {
			readonly kind: "hardBlocker";
			readonly name: string;
			readonly stage: string;
			readonly arms: ByArm<Reading<Firings>>;
			readonly readings: ByPair<ItemReading>;
	  }
	| {
			readonly kind: "dimension";
			readonly name: string;
			readonly stage: string;
			readonly arms: ByArm<
				Reading<LetterRange & { readonly graded?: number | undefined }>
			>;
			readonly readings: ByPair<ItemReading>;
	  }
	| {
			readonly kind: "meter";
			readonly name: "replyLength" | "costPerAttempt";
			readonly arms: ByArm<Reading<MeterSpread>>;
			readonly readings: ByPair<MeterReading>;
	  };

interface GradedItem<Value> {
	readonly stage: string;
	readonly id: string;
	readonly value: Value;
}

interface CaseQualityReadings {
	readonly qualityReadings: ByPair<Readonly<Record<string, QualityReading>>>;
	readonly measures: readonly string[];
}

export type {
	ReportCase,
	ReportArm,
	ReportRep,
	ByArm,
	ByPair,
	Firings,
	MeterSpread,
	ItemReading,
	MeterReading,
	WhatMovedRow,
	GradedItem,
	CaseQualityReadings,
};
