import type { ComparisonArm } from "#benchmark/comparison-record";
import { STAGE_LETTER_GRADES } from "#benchmark/config";
import type { StageLetterGrade } from "#benchmark/config";
import { byPair, mapArms } from "#server/comparison-arm-pair";
import type { QualityReading } from "#server/comparison-quality-reading";
import type {
	ByArm,
	Firings,
	GradedItem,
	ItemReading,
	ReportArm,
	ReportCase,
	ReportRep,
	WhatMovedRow,
} from "#server/comparison-what-moved-contract";
import firingsReading from "#server/comparison-what-moved-firings-reading";
import {
	NO_GRADED_REP_REASON,
	letterRange,
} from "#server/confirmation-group-summary";
import type { LetterRange } from "#server/confirmation-group-summary";
import type { Reading } from "#server/run-record";

const EMPTY_COLLECTION_LENGTH = 0;

const NO_STAGE_GRADING_REASON =
	"no rep of this arm recorded this item's grading";

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
			hardBlockers.map(({ id, fired }) => ({ id, stage, value: fired })),
		),
	);
}

function dimensionsOf(arm: ReportArm): GradedItem<StageLetterGrade>[] {
	return arm.source.reps.flatMap((rep) =>
		stageGradingOf(rep).flatMap(({ stage, dimensions }) =>
			dimensions.map(({ id, grade }) => ({ id, stage, value: grade })),
		),
	);
}

function valuesFor<Value>(
	items: readonly GradedItem<Value>[],
	key: { readonly stage: string; readonly id: string },
): Value[] {
	return items.flatMap(({ stage, id, value }) =>
		stage === key.stage && id === key.id ? [value] : [],
	);
}

function letterIndex(grade: StageLetterGrade): number {
	return STAGE_LETTER_GRADES.indexOf(grade);
}

function letterInterval(
	range: Reading<LetterRange>,
): QualityReading["interval"]["minuend"] {
	return range.state === "available"
		? { high: range.highest, low: range.lowest }
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
		return { interval, verdict: { arm: arms.minuend, kind: "separated" } };
	}
	if (letterIndex(subtrahend.lowest) < letterIndex(minuend.highest)) {
		return { interval, verdict: { arm: arms.subtrahend, kind: "separated" } };
	}

	return { interval, verdict: { kind: "insideRerunNoise" } };
}

function blockerRows(benchmarkCase: ReportCase): WhatMovedRow[] {
	const items = mapArms(benchmarkCase, blockersOf);

	return itemKeys(items).map((key) => {
		const arms = mapArms(benchmarkCase, (_arm, role): Reading<Firings> => {
			const fired = valuesFor(items[role], key);

			return fired.length === EMPTY_COLLECTION_LENGTH
				? { reasons: [NO_STAGE_GRADING_REASON], state: "unavailable" }
				: {
						fired: fired.filter(Boolean).length,
						of: fired.length,
						state: "available",
					};
		});

		return {
			arms,
			kind: "hardBlocker",
			name: key.id,
			readings: byPair(arms, firingsReading),
			stage: key.stage,
		};
	});
}

function dimensionRows(benchmarkCase: ReportCase): WhatMovedRow[] {
	const items = mapArms(benchmarkCase, dimensionsOf);

	return itemKeys(items).map((key) => {
		const arms = mapArms(
			benchmarkCase,
			(_arm, role): Reading<LetterRange & { readonly graded: number }> => {
				const grades = valuesFor(items[role], key);
				const range = letterRange(grades);

				return range === undefined
					? { reasons: [NO_GRADED_REP_REASON], state: "unavailable" }
					: { state: "available", ...range, graded: grades.length };
			},
		);

		return {
			arms,
			kind: "dimension",
			name: key.id,
			readings: byPair(arms, dimensionReading),
			stage: key.stage,
		};
	});
}

/** Every stage and item any arm graded, in first-seen order. */
function itemKeys<Value>(
	byArm: ByArm<readonly GradedItem<Value>[]>,
): { readonly stage: string; readonly id: string }[] {
	const seen = new Map<string, { stage: string; id: string }>();
	for (const items of [byArm.baseline, byArm.candidate, byArm.control]) {
		for (const { stage, id } of items) {
			seen.set(JSON.stringify([stage, id]), { id, stage });
		}
	}

	return [...seen.values()];
}

export {
	NO_STAGE_GRADING_REASON,
	dimensionReading,
	blockerRows,
	dimensionRows,
};
