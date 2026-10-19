import type { ComparisonArm } from "#benchmark/comparison-record";
import { spendReading } from "#client/run-history/run-progress";
import { CANDIDATE_AGAINST_BASELINE } from "#server/comparison-arm-pair";
import type { WhatMovedRow } from "#server/comparison-what-moved";

import { DESIGN_ARMS } from "./design-arms";
import type { ReadingText } from "./reading-text";
import { meterReadingText, qualityReadingText } from "./reading-text";

type MeterRow = Extract<WhatMovedRow, { readonly kind: "meter" }>;

const METER_NAMES = {
	costPerAttempt: "Cost per attempt",
	replyLength: "Reply length",
} as const;

function measureName(row: WhatMovedRow): string {
	return row.kind === "meter" ? METER_NAMES[row.name] : row.name;
}

function rateScale(row: WhatMovedRow): boolean {
	return (
		row.kind === "hardBlocker" ||
		(row.kind === "overall" &&
			DESIGN_ARMS.some(({ arm }) => row.arms[arm]?.scale === "successRate"))
	);
}

function intervalLabel(row: WhatMovedRow): string {
	if (rateScale(row)) {
		return row.kind === "hardBlocker"
			? "Firing rate · 95% confidence interval"
			: "Pass rate · 95% confidence interval";
	}

	return row.kind === "meter"
		? "Mean and observed range"
		: "Median and observed grade range";
}

function meterValue(name: MeterRow["name"], value: number): string {
	return name === "costPerAttempt"
		? spendReading(value)
		: `${String(Math.round(value))} words`;
}

function readingOf(row: WhatMovedRow): ReadingText | undefined {
	if (row.kind === "meter") {
		const reading = row.readings[CANDIDATE_AGAINST_BASELINE];
		return reading === undefined
			? undefined
			: meterReadingText(reading.verdict);
	}

	const reading = row.readings[CANDIDATE_AGAINST_BASELINE];
	return reading === undefined
		? undefined
		: qualityReadingText(reading.verdict);
}

function armFigure(row: WhatMovedRow, arm: ComparisonArm): string {
	switch (row.kind) {
		case "overall": {
			return overallArmFigure(row.arms[arm]);
		}
		case "hardBlocker": {
			const figure = row.arms[arm];
			return figure.state === "available"
				? `${figure.fired}/${figure.of} fired`
				: "Not recorded";
		}
		case "dimension": {
			const figure = row.arms[arm];
			return figure.state === "available"
				? `${figure.median} · ${figure.graded === undefined ? "count not recorded" : `n=${figure.graded}`}`
				: "Not recorded";
		}
		case "meter": {
			const figure = row.arms[arm];
			return figure.state === "available"
				? `${meterValue(row.name, figure.mean)} · n=${figure.counted}`
				: "Not recorded";
		}
		default: {
			return row satisfies never;
		}
	}
}

function armReasons(row: WhatMovedRow): readonly string[] {
	return [
		...new Set(
			DESIGN_ARMS.flatMap(({ arm }) => {
				if (row.kind === "overall") {
					const figure = row.arms[arm];
					return figure?.scale === "letters" &&
						figure.grades.state === "unavailable"
						? figure.grades.reasons
						: [];
				}

				const figure = row.arms[arm];
				return figure.state === "unavailable" ? figure.reasons : [];
			}),
		),
	];
}

function overallArmFigure(
	figure: Extract<WhatMovedRow, { kind: "overall" }>["arms"][ComparisonArm],
): string {
	if (figure === undefined) {
		return "Not recorded";
	}

	if (figure.scale === "successRate") {
		return `${figure.successful}/${figure.attempts} passed`;
	}

	return figure.grades.state === "available"
		? `${figure.grades.median} · n=${figure.grades.graded}`
		: "Not recorded";
}

export {
	armFigure,
	armReasons,
	intervalLabel,
	measureName,
	meterValue,
	rateScale,
	readingOf,
};
export { CANDIDATE_AGAINST_BASELINE } from "#server/comparison-arm-pair";
export type { MeterRow };
