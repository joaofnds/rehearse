import type { ComparisonArm } from "#benchmark/comparison-record";
import type {
	MeterReading,
	MeterSpread,
} from "#server/comparison-what-moved-contract";
import type { Reading } from "#server/run-record";

const UNCHANGED_PERCENTAGE_DELTA = 0;

const MAXIMUM_SEPARATION_PROBABILITY = 1;

const SEPARATION_TAIL_COUNT = 2;

const ZERO_BASELINE_MEAN = 0;

const SEPARATION_SELECTION_COUNT_INCREMENT = 1;

const PERCENTAGE_POINTS_PER_UNIT = 100;

/**
 * The largest chance of every attempt of one arm landing above every attempt
 * of the other by rerun noise alone that still names an arm as higher.
 */
const METER_SEPARATION_ALPHA = 0.05;

function signedPercent(change: number): string {
	const rounded = Math.round(change * PERCENTAGE_POINTS_PER_UNIT);

	return `${rounded > UNCHANGED_PERCENTAGE_DELTA ? "+" : ""}${String(rounded)}%`;
}

/** 2 / C(n + m, n), the two-sided chance of full separation by noise. */
function separationChance(left: number, right: number): number {
	let arrangements = 1;
	for (
		let chosen = 1;
		chosen <= left;
		chosen += SEPARATION_SELECTION_COUNT_INCREMENT
	) {
		arrangements = (arrangements * (right + chosen)) / chosen;
	}

	return Math.min(
		MAXIMUM_SEPARATION_PROBABILITY,
		SEPARATION_TAIL_COUNT / arrangements,
	);
}

function meterInterval(
	spread: Reading<MeterSpread>,
): MeterReading["interval"]["minuend"] {
	return spread.state === "available"
		? { high: spread.high, low: spread.low }
		: undefined;
}

function meterReading(
	minuend: Reading<MeterSpread>,
	subtrahend: Reading<MeterSpread>,
	arms: { readonly minuend: ComparisonArm; readonly subtrahend: ComparisonArm },
): MeterReading {
	const interval = {
		minuend: meterInterval(minuend),
		subtrahend: meterInterval(subtrahend),
	};
	if (minuend.state === "unavailable" || subtrahend.state === "unavailable") {
		const reasons = [minuend, subtrahend].flatMap((spread) =>
			spread.state === "unavailable" ? spread.reasons : [],
		);

		return {
			change: undefined,
			interval,
			verdict: { kind: "unavailable", reasons: [...new Set(reasons)] },
		};
	}

	const change =
		subtrahend.mean === ZERO_BASELINE_MEAN
			? undefined
			: signedPercent((minuend.mean - subtrahend.mean) / subtrahend.mean);
	if (
		intervalsOverlap(minuend, subtrahend) ||
		separationChance(minuend.counted, subtrahend.counted) >
			METER_SEPARATION_ALPHA
	) {
		return { change, interval, verdict: { kind: "insideRerunNoise" } };
	}

	return {
		change,
		interval,
		verdict: {
			arm: minuend.mean > subtrahend.mean ? arms.minuend : arms.subtrahend,
			kind: "higher",
		},
	};
}

const EMPTY_OBSERVATION_TOTAL = 0;

const EMPTY_COLLECTION_LENGTH = 0;

function meterSpread(
	values: readonly number[],
	unavailableReasons: readonly string[],
): Reading<MeterSpread> {
	if (values.length === EMPTY_COLLECTION_LENGTH) {
		return { reasons: unavailableReasons, state: "unavailable" };
	}

	return {
		counted: values.length,
		high: Math.max(...values),
		low: Math.min(...values),
		mean:
			values.reduce((sum, value) => sum + value, EMPTY_OBSERVATION_TOTAL) /
			values.length,
		state: "available",
	};
}

function intervalsOverlap(
	left: { readonly low: number; readonly high: number },
	right: { readonly low: number; readonly high: number },
): boolean {
	return left.low <= right.high && right.low <= left.high;
}

export { meterReading, meterSpread, intervalsOverlap };
