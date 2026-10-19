import { missingCostReasons } from "#benchmark/more-attempts-cost";
import type { OutputWords } from "#benchmark/output-words";
import type {
	ArmFigures,
	CaseArmFigures,
} from "#server/comparison-arm-figures";
import { byPair, mapArms } from "#server/comparison-arm-pair";
import { blockerRows, dimensionRows } from "#server/comparison-stage-grading";
import type {
	CaseQualityReadings,
	MeterSpread,
	ReportArm,
	ReportCase,
	ReportRep,
	WhatMovedRow,
} from "#server/comparison-what-moved-contract";
import {
	meterReading,
	meterSpread,
} from "#server/comparison-what-moved-meter-reading";
import type { Reading } from "#server/run-record";

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
		return { reasons: missingCostReasons(resources), state: "unavailable" };
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
function whatMoved(
	benchmarkCase: ReportCase,
	figures: CaseArmFigures,
	{ qualityReadings, measures }: CaseQualityReadings,
): readonly WhatMovedRow[] {
	const overall: WhatMovedRow[] = measures.map((name) => ({
		arms: {
			baseline: figures.baseline.measures[name],
			candidate: figures.candidate.measures[name],
			control: figures.control.measures[name],
		},
		kind: "overall",
		name,
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
			arms: replyLengths,
			kind: "meter",
			name: "replyLength",
			readings: byPair(replyLengths, meterReading),
		},
		{
			arms: costs,
			kind: "meter",
			name: "costPerAttempt",
			readings: byPair(costs, meterReading),
		},
	];
}

export { whatMoved };
export {
	NO_STAGE_GRADING_REASON,
	dimensionReading,
} from "#server/comparison-stage-grading";
export { default as firingsReading } from "#server/comparison-what-moved-firings-reading";
export { meterReading } from "#server/comparison-what-moved-meter-reading";
export type {
	Firings,
	MeterSpread,
	ItemReading,
	MeterReading,
	WhatMovedRow,
} from "#server/comparison-what-moved-contract";
