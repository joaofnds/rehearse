import type { ComparisonArm } from "#benchmark/comparison-record";
import { STAGE_LETTER_GRADES } from "#benchmark/stage-letter-grades";
import type { RangePlotRow } from "#client/system/components/range-plot";
import { armPairs, pairKey } from "#server/comparison-arm-pair";
import type { QualityInterval } from "#server/comparison-quality-reading";
import type { WhatMovedRow } from "#server/comparison-what-moved";

import { DESIGN_ARMS } from "./design-arms";
import type { MeterRow } from "./what-moved-readings";
import { meterValue, rateScale } from "./what-moved-readings";

const NO_ATTEMPTS = 0;

const NO_RECORDED_BLOCKER_JUDGMENTS = 0;

const MEASUREMENT_PLOT_ORIGIN = 0;

const FINAL_GRADE_RANK_ADJUSTMENT = 1;

const FALLBACK_PLOT_UPPER_BOUND = 1;

const PERCENT_SCALE = 100;

const LETTERS_UP: readonly string[] = STAGE_LETTER_GRADES.toReversed();

function qualityInterval(
	row: Exclude<WhatMovedRow, MeterRow>,
	arm: ComparisonArm,
): QualityInterval | undefined {
	for (const pair of armPairs()) {
		const reading = row.readings[pairKey(pair)];
		if (pair.minuend === arm && reading?.interval.minuend !== undefined) {
			return reading.interval.minuend;
		}
		if (pair.subtrahend === arm && reading?.interval.subtrahend !== undefined) {
			return reading.interval.subtrahend;
		}
	}

	return undefined;
}

function armPoint(
	row: Exclude<WhatMovedRow, MeterRow>,
	arm: ComparisonArm,
): number | undefined {
	switch (row.kind) {
		case "overall": {
			const figure = row.arms[arm];
			if (figure?.scale === "successRate") {
				return figure.attempts === NO_ATTEMPTS
					? undefined
					: (figure.successful / figure.attempts) * PERCENT_SCALE;
			}

			return figure?.grades.state === "available"
				? LETTERS_UP.indexOf(figure.grades.median)
				: undefined;
		}
		case "hardBlocker": {
			const figure = row.arms[arm];
			return figure.state === "available" &&
				figure.of > NO_RECORDED_BLOCKER_JUDGMENTS
				? (figure.fired / figure.of) * PERCENT_SCALE
				: undefined;
		}
		case "dimension": {
			const figure = row.arms[arm];
			return figure.state === "available"
				? LETTERS_UP.indexOf(figure.median)
				: undefined;
		}
		default: {
			return row satisfies never;
		}
	}
}

function armRange(row: WhatMovedRow, arm: ComparisonArm): ArmRange | undefined {
	if (row.kind === "meter") {
		const figure = row.arms[arm];
		return figure.state === "available"
			? { high: figure.high, low: figure.low, value: figure.mean }
			: undefined;
	}

	const grades = gradeArmRange(row, arm);
	if (grades !== undefined) {
		return grades;
	}
	const interval = qualityInterval(row, arm);
	return interval === undefined
		? undefined
		: intervalArmRange(row, arm, interval);
}

interface ArmRange {
	readonly low: number;
	readonly high: number;
	readonly value?: number;
}

function gradeArmRange(
	row: Exclude<WhatMovedRow, MeterRow>,
	arm: ComparisonArm,
): ArmRange | undefined {
	if (row.kind === "overall") {
		const figure = row.arms[arm];
		if (figure?.scale === "letters" && figure.grades.state === "available") {
			return {
				high: LETTERS_UP.indexOf(figure.grades.highest),
				low: LETTERS_UP.indexOf(figure.grades.lowest),
				value: LETTERS_UP.indexOf(figure.grades.median),
			};
		}
	}
	if (row.kind === "dimension" && row.arms[arm].state === "available") {
		const figure = row.arms[arm];
		if (figure.state === "available") {
			return {
				high: LETTERS_UP.indexOf(figure.highest),
				low: LETTERS_UP.indexOf(figure.lowest),
				value: LETTERS_UP.indexOf(figure.median),
			};
		}
	}

	return undefined;
}

function intervalArmRange(
	row: Exclude<WhatMovedRow, MeterRow>,
	arm: ComparisonArm,
	interval: QualityInterval,
): ArmRange {
	if (rateScale(row)) {
		const range = {
			high: Number(interval.high.replace("%", "")),
			low: Number(interval.low.replace("%", "")),
		};
		const value = armPoint(row, arm);
		return value === undefined ? range : { ...range, value };
	}

	return {
		high: LETTERS_UP.indexOf(interval.high),
		low: LETTERS_UP.indexOf(interval.low),
	};
}

interface SpreadReading {
	readonly rows: readonly RangePlotRow[];
	readonly minimum: number;
	readonly maximum: number;
	readonly valueLabel: string;
	readonly rate: boolean;
}

function spreadReading(row: WhatMovedRow): SpreadReading {
	const rows = spreadRows(row);
	const rate = rateScale(row);
	const minimum =
		row.kind === "meter"
			? Math.min(MEASUREMENT_PLOT_ORIGIN, ...rows.map(({ low }) => low))
			: MEASUREMENT_PLOT_ORIGIN;
	return { minimum, rate, rows, ...spreadBounds(row, rows, rate) };
}

function spreadRows(row: WhatMovedRow): readonly RangePlotRow[] {
	return DESIGN_ARMS.flatMap(({ arm, role }) => {
		const range = armRange(row, arm);
		return range === undefined
			? []
			: [
					{
						id: arm,
						label: role.replace(" (before)", "").replace(" (after)", ""),
						...range,
					},
				];
	});
}

interface SpreadBounds {
	readonly maximum: number;
	readonly valueLabel: string;
}

function spreadBounds(
	row: WhatMovedRow,
	rows: readonly RangePlotRow[],
	rate: boolean,
): SpreadBounds {
	let maximum = LETTERS_UP.length - FINAL_GRADE_RANK_ADJUSTMENT;
	let valueLabel = "median";
	if (rate) {
		maximum = PERCENT_SCALE;
		valueLabel = "observed rate";
	} else if (row.kind === "meter") {
		maximum =
			Math.max(MEASUREMENT_PLOT_ORIGIN, ...rows.map(({ high }) => high)) ||
			FALLBACK_PLOT_UPPER_BOUND;
		valueLabel = "mean";
	}

	return { maximum, valueLabel };
}

function spreadValue(row: WhatMovedRow, rate: boolean, value: number): string {
	if (row.kind === "meter") {
		return meterValue(row.name, value);
	}

	return rate ? `${Math.round(value)}%` : (LETTERS_UP[Math.round(value)] ?? "");
}

export { spreadReading, spreadValue };
