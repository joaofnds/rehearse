import { STAGE_LETTER_GRADES } from "#benchmark/config";
import type { StageLetterGrade } from "#benchmark/config";
import { wilsonInterval } from "#benchmark/comparison-estimator";
import type { ProportionInterval } from "#benchmark/comparison-estimator";
import type {
	ComparisonArm,
	ComparisonReport,
	LegacyComparisonReport,
} from "#benchmark/comparison-record";
import type { OutputWords } from "#benchmark/output-words";
import type {
	ArmFigures,
	CaseArmFigures,
	MeasureFigure,
} from "./comparison-arm-figures";
import { missingCostReasons } from "./comparison-arm-figures";
import { armPairs, pairKey } from "./comparison-arm-pair";
import type {
	QualityInterval,
	QualityReading,
	QualityVerdict,
} from "./comparison-quality-reading";
import {
	letterRange,
	NO_GRADED_REP_REASON,
} from "./confirmation-group-summary";
import type { LetterRange } from "./confirmation-group-summary";
import type { Reading } from "./run-record";

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

export interface Firings {
	readonly fired: number;
	readonly of: number;
}

/** The observed low and high of a per-attempt quantity, beside its mean. */
export interface MeterSpread {
	readonly mean: number;
	readonly low: number;
	readonly high: number;
	readonly counted: number;
}

/** An arm that recorded nothing for the item leaves nothing to compare. */
interface UnavailableVerdict {
	readonly kind: "unavailable";
}

/** A blocker or dimension reading, which one arm's missing grading voids. */
export interface ItemReading {
	readonly interval: QualityReading["interval"];
	readonly verdict: QualityVerdict | UnavailableVerdict;
}

/**
 * The largest chance of every attempt of one arm landing above every attempt
 * of the other by rerun noise alone that still names an arm as higher.
 */
const METER_SEPARATION_ALPHA = 0.05;

/**
 * A meter is neither better nor worse higher up, so its verdict names the
 * arm that ran higher rather than the arm that did better. It does so only
 * when the arms' ranges are disjoint and that separation is unlikely under
 * rerun noise: with exchangeable attempts, full separation in either
 * direction has probability 2 / C(n + m, n), so two attempts an arm never
 * name one higher. `change` is the minuend's mean against the subtrahend's,
 * as a signed percentage.
 */
export interface MeterReading {
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
		| UnavailableVerdict
		| { readonly kind: "higher"; readonly arm: ComparisonArm };
}

export type WhatMovedRow =
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
			readonly arms: ByArm<Reading<LetterRange>>;
			readonly readings: ByPair<ItemReading>;
	  }
	| {
			readonly kind: "meter";
			readonly name: "replyLength" | "costPerAttempt";
			readonly arms: ByArm<Reading<MeterSpread>>;
			readonly readings: ByPair<MeterReading>;
	  };

export const NO_STAGE_GRADING_REASON =
	"no rep of this arm recorded this item's grading";

interface GradedItem<Value> {
	readonly stage: string;
	readonly id: string;
	readonly value: Value;
}

function stageGradingOf(
	rep: ReportRep,
): NonNullable<
	Extract<ReportRep, { readonly stageGrading?: unknown }>["stageGrading"]
> {
	return "stageGrading" in rep && rep.stageGrading !== undefined
		? rep.stageGrading
		: [];
}

function blockersOf(arm: ReportArm): GradedItem<boolean>[] {
	return arm.source.reps.flatMap((rep) =>
		stageGradingOf(rep).flatMap(({ stage, hardBlockers }) =>
			hardBlockers.map(({ id, fired }) => ({ stage, id, value: fired })),
		),
	);
}

function dimensionsOf(arm: ReportArm): GradedItem<StageLetterGrade>[] {
	return arm.source.reps.flatMap((rep) =>
		stageGradingOf(rep).flatMap(({ stage, dimensions }) =>
			dimensions.map(({ id, grade }) => ({ stage, id, value: grade })),
		),
	);
}

/** Every stage and item any arm graded, in first-seen order. */
function itemKeys<Value>(
	byArm: ByArm<readonly GradedItem<Value>[]>,
): { readonly stage: string; readonly id: string }[] {
	const seen = new Map<string, { stage: string; id: string }>();
	for (const items of [byArm.baseline, byArm.candidate, byArm.control]) {
		for (const { stage, id } of items) {
			seen.set(JSON.stringify([stage, id]), { stage, id });
		}
	}

	return [...seen.values()];
}

function valuesFor<Value>(
	items: readonly GradedItem<Value>[],
	key: { readonly stage: string; readonly id: string },
): Value[] {
	return items.flatMap(({ stage, id, value }) =>
		stage === key.stage && id === key.id ? [value] : [],
	);
}

function percent(proportion: number): string {
	return `${Math.round(proportion * 100)}%`;
}

function intervalsOverlap(
	left: { readonly low: number; readonly high: number },
	right: { readonly low: number; readonly high: number },
): boolean {
	return left.low <= right.high && right.low <= left.high;
}

export function firingsReading(
	minuend: Reading<Firings>,
	subtrahend: Reading<Firings>,
	arms: { readonly minuend: ComparisonArm; readonly subtrahend: ComparisonArm },
): ItemReading {
	if (minuend.state === "unavailable" || subtrahend.state === "unavailable") {
		return {
			interval: {
				minuend: firingInterval(minuend),
				subtrahend: firingInterval(subtrahend),
			},
			verdict: { kind: "unavailable" },
		};
	}

	const minuendRate = wilsonInterval(minuend.fired, minuend.of);
	const subtrahendRate = wilsonInterval(subtrahend.fired, subtrahend.of);

	return {
		interval: {
			minuend: rateLabel(minuendRate),
			subtrahend: rateLabel(subtrahendRate),
		},
		verdict: firingsVerdict(
			{ minuend, subtrahend },
			intervalsOverlap(minuendRate, subtrahendRate),
			arms,
		),
	};
}

function firingInterval(
	firings: Reading<Firings>,
): QualityReading["interval"]["minuend"] {
	return firings.state === "available"
		? rateLabel(wilsonInterval(firings.fired, firings.of))
		: undefined;
}

function rateLabel(interval: ProportionInterval): QualityInterval {
	return { low: percent(interval.low), high: percent(interval.high) };
}

/** A blocker fires on failure, so the arm that fires less often did better. */
function firingsVerdict(
	firings: { readonly minuend: Firings; readonly subtrahend: Firings },
	overlapping: boolean,
	arms: { readonly minuend: ComparisonArm; readonly subtrahend: ComparisonArm },
): QualityVerdict {
	if (firings.minuend.fired === 0 && firings.subtrahend.fired === 0) {
		return { kind: "unchangedAlreadyClear" };
	}
	if (overlapping) {
		return { kind: "insideRerunNoise" };
	}

	return {
		kind: "separated",
		arm:
			firings.minuend.fired / firings.minuend.of <
			firings.subtrahend.fired / firings.subtrahend.of
				? arms.minuend
				: arms.subtrahend,
	};
}

function letterIndex(grade: StageLetterGrade): number {
	return STAGE_LETTER_GRADES.indexOf(grade);
}

/** Best first, as a stage measure's letter span reads. */
function letterInterval(
	range: Reading<LetterRange>,
): QualityReading["interval"]["minuend"] {
	return range.state === "available"
		? { low: range.highest, high: range.lowest }
		: undefined;
}

function dimensionReading(
	minuend: Reading<LetterRange>,
	subtrahend: Reading<LetterRange>,
	arms: { readonly minuend: ComparisonArm; readonly subtrahend: ComparisonArm },
): ItemReading {
	const interval = {
		minuend: letterInterval(minuend),
		subtrahend: letterInterval(subtrahend),
	};
	if (minuend.state === "unavailable" || subtrahend.state === "unavailable") {
		return { interval, verdict: { kind: "unavailable" } };
	}
	if (minuend.lowest === "A" && subtrahend.lowest === "A") {
		return { interval, verdict: { kind: "unchangedAlreadyClear" } };
	}
	if (letterIndex(minuend.lowest) < letterIndex(subtrahend.highest)) {
		return { interval, verdict: { kind: "separated", arm: arms.minuend } };
	}
	if (letterIndex(subtrahend.lowest) < letterIndex(minuend.highest)) {
		return { interval, verdict: { kind: "separated", arm: arms.subtrahend } };
	}

	return { interval, verdict: { kind: "insideRerunNoise" } };
}

function meterSpread(
	values: readonly number[],
	unavailableReasons: readonly string[],
): Reading<MeterSpread> {
	if (values.length === 0) {
		return { state: "unavailable", reasons: unavailableReasons };
	}

	return {
		state: "available",
		mean: values.reduce((sum, value) => sum + value, 0) / values.length,
		low: Math.min(...values),
		high: Math.max(...values),
		counted: values.length,
	};
}

function signedPercent(change: number): string {
	const rounded = Math.round(change * 100);

	return `${rounded > 0 ? "+" : ""}${String(rounded)}%`;
}

/** 2 / C(n + m, n), the two-sided chance of full separation by noise. */
function separationChance(left: number, right: number): number {
	let arrangements = 1;
	for (let chosen = 1; chosen <= left; chosen += 1) {
		arrangements = (arrangements * (right + chosen)) / chosen;
	}

	return Math.min(1, 2 / arrangements);
}

export function meterReading(
	minuend: Reading<MeterSpread>,
	subtrahend: Reading<MeterSpread>,
	arms: { readonly minuend: ComparisonArm; readonly subtrahend: ComparisonArm },
): MeterReading {
	const spanOf = (
		spread: Reading<MeterSpread>,
	): MeterReading["interval"]["minuend"] =>
		spread.state === "available"
			? { low: spread.low, high: spread.high }
			: undefined;
	const interval = { minuend: spanOf(minuend), subtrahend: spanOf(subtrahend) };
	if (minuend.state === "unavailable" || subtrahend.state === "unavailable") {
		return {
			interval,
			change: undefined,
			verdict: { kind: "unavailable" },
		};
	}

	const change =
		subtrahend.mean === 0
			? undefined
			: signedPercent((minuend.mean - subtrahend.mean) / subtrahend.mean);
	if (
		intervalsOverlap(minuend, subtrahend) ||
		separationChance(minuend.counted, subtrahend.counted) >
			METER_SEPARATION_ALPHA
	) {
		return { interval, change, verdict: { kind: "insideRerunNoise" } };
	}

	return {
		interval,
		change,
		verdict: {
			kind: "higher",
			arm: minuend.mean > subtrahend.mean ? arms.minuend : arms.subtrahend,
		},
	};
}

function byPair<Figure, Row>(
	arms: ByArm<Figure>,
	read: (
		minuend: Figure,
		subtrahend: Figure,
		names: {
			readonly minuend: ComparisonArm;
			readonly subtrahend: ComparisonArm;
		},
	) => Row,
): ByPair<Row> {
	return Object.fromEntries(
		armPairs().map((names) => [
			pairKey(names.minuend, names.subtrahend),
			read(arms[names.minuend], arms[names.subtrahend], names),
		]),
	);
}

function mapArms<Value>(
	benchmarkCase: ReportCase,
	value: (arm: ReportArm, role: ComparisonArm) => Value,
): ByArm<Value> {
	return {
		baseline: value(benchmarkCase.arms.baseline, "baseline"),
		candidate: value(benchmarkCase.arms.candidate, "candidate"),
		control: value(benchmarkCase.arms.control, "control"),
	};
}

function blockerRows(benchmarkCase: ReportCase): WhatMovedRow[] {
	const items = mapArms(benchmarkCase, blockersOf);

	return itemKeys(items).map((key) => {
		const arms = mapArms(benchmarkCase, (_arm, role): Reading<Firings> => {
			const fired = valuesFor(items[role], key);

			return fired.length === 0
				? { state: "unavailable", reasons: [NO_STAGE_GRADING_REASON] }
				: {
						state: "available",
						fired: fired.filter(Boolean).length,
						of: fired.length,
					};
		});

		return {
			kind: "hardBlocker",
			name: key.id,
			stage: key.stage,
			arms,
			readings: byPair(arms, firingsReading),
		};
	});
}

function dimensionRows(benchmarkCase: ReportCase): WhatMovedRow[] {
	const items = mapArms(benchmarkCase, dimensionsOf);

	return itemKeys(items).map((key) => {
		const arms = mapArms(benchmarkCase, (_arm, role): Reading<LetterRange> => {
			const range = letterRange(valuesFor(items[role], key));

			return range === undefined
				? { state: "unavailable", reasons: [NO_GRADED_REP_REASON] }
				: { state: "available", ...range };
		});

		return {
			kind: "dimension",
			name: key.id,
			stage: key.stage,
			arms,
			readings: byPair(arms, dimensionReading),
		};
	});
}

function recordedWords(rep: ReportRep): OutputWords | undefined {
	return "words" in rep ? rep.words : undefined;
}

function replyLength(
	arm: ReportArm,
	figures: ArmFigures,
): Reading<MeterSpread> {
	if (figures.words.state === "unavailable") {
		return figures.words;
	}

	return meterSpread(
		arm.source.reps.flatMap((rep) => {
			const words = recordedWords(rep);

			return words?.state === "available" ? [words.words] : [];
		}),
		[],
	);
}

function costPerAttempt({ resources }: ReportArm): Reading<MeterSpread> {
	if (resources.status === "UNAVAILABLE") {
		return { state: "unavailable", reasons: missingCostReasons(resources) };
	}

	return meterSpread(resources.total.costUsd.values, []);
}

/**
 * The What moved table for one case: its overall measures, then each hard
 * blocker as firings of the reps graded on it, each quality dimension, and
 * the two meters, reply length and cost per attempt. Blocker and dimension
 * rows come from the grading a stage report records per rep, so a report
 * written before that carries none.
 */
export function whatMoved(
	benchmarkCase: ReportCase,
	figures: CaseArmFigures,
	qualityReadings: ByPair<Readonly<Record<string, QualityReading>>>,
	measures: readonly string[],
): readonly WhatMovedRow[] {
	const overall: WhatMovedRow[] = measures.map((name) => ({
		kind: "overall",
		name,
		arms: {
			baseline: figures.baseline.measures[name],
			candidate: figures.candidate.measures[name],
			control: figures.control.measures[name],
		},
		readings: Object.fromEntries(
			Object.entries(qualityReadings).flatMap(([pair, readings]) => {
				const reading = readings[name];

				return reading === undefined ? [] : [[pair, reading]];
			}),
		),
	}));
	const replyLengths = mapArms(benchmarkCase, (arm, role) =>
		replyLength(arm, figures[role]),
	);
	const costs = mapArms(benchmarkCase, costPerAttempt);

	return [
		...overall,
		...blockerRows(benchmarkCase),
		...dimensionRows(benchmarkCase),
		{
			kind: "meter",
			name: "replyLength",
			arms: replyLengths,
			readings: byPair(replyLengths, meterReading),
		},
		{
			kind: "meter",
			name: "costPerAttempt",
			arms: costs,
			readings: byPair(costs, meterReading),
		},
	];
}
