import { describe, expect, it } from "bun:test";

import { within } from "@testing-library/react";

import type { ArmFigures } from "#server/comparison-arm-figures";

import {
	FIGURES,
	band,
	card,
	lettered,
	renderBand,
} from "./arm-card-test-fixtures";
import ArmCardsBand from "./arm-cards-band";

describe(ArmCardsBand.name, () => {
	it(
		"orders the cards baseline, baseline (before), candidate (after)",
		ordersTheCardsBaselineBaselineBeforeCandidateAfter,
	);

	it(
		"shows an arm's corpus version, its description, and its median of the graded attempts with their range",
		showsAnArmSCorpusVersionItsDescriptionAndItsMedianOfTheGradedAttemptsWithTheirRange,
	);

	it(
		"shows an arm's recorded cost beside its average words",
		showsAnArmSRecordedCostBesideItsAverageWords,
	);

	it(
		"describes baseline (before) as the arm before the edit",
		describesBaselineBeforeAsTheArmBeforeTheEdit,
	);

	it(
		"shows the successes of the attempts on a pass/fail measure",
		showsTheSuccessesOfTheAttemptsOnAPassFailMeasure,
	);

	it(
		"names each measure when an arm has more than one",
		namesEachMeasureWhenAnArmHasMoreThanOne,
	);
});

function ordersTheCardsBaselineBaselineBeforeCandidateAfter(): void {
	renderBand();

	const roles = within(band())
		.getAllByRole("article")
		.map((article) => article.getAttribute("aria-label"));

	expect(roles).toEqual(["CONTROL", "BASELINE (BEFORE)", "CANDIDATE (AFTER)"]);
}

function showsAnArmSCorpusVersionItsDescriptionAndItsMedianOfTheGradedAttemptsWithTheirRange(): void {
	renderBand();

	const armB = card("CANDIDATE (AFTER)");

	expect(armB).toHaveTextContent("corpus@a41c7e");
	expect(armB).toHaveTextContent("after the edit");
	expect(within(armB).getByText("B")).toBeInTheDocument();
	expect(armB).toHaveTextContent("median of 2 · range C – A");
}

function showsAnArmSRecordedCostBesideItsAverageWords(): void {
	renderBand();

	const armB = card("CANDIDATE (AFTER)");

	expect(armB).toHaveTextContent("$3.31 · avg 925 words");
}

function describesBaselineBeforeAsTheArmBeforeTheEdit(): void {
	renderBand();

	const armA = card("BASELINE (BEFORE)");

	expect(armA).toHaveTextContent("before the edit");
}

function showsTheSuccessesOfTheAttemptsOnAPassFailMeasure(): void {
	const passFail: ArmFigures = {
		...lettered({ highest: "A", lowest: "C", median: "B", words: 900 }),
		measures: {
			checks: { attempts: 4, scale: "successRate", successful: 3 },
		},
	};

	renderBand({ figures: { ...FIGURES, candidate: passFail } });

	const armB = card("CANDIDATE (AFTER)");

	expect(within(armB).getByText("3/4")).toBeInTheDocument();
	expect(armB).toHaveTextContent("3 of 4 attempts passed");
}

function namesEachMeasureWhenAnArmHasMoreThanOne(): void {
	const twoMeasures: ArmFigures = {
		...lettered({ highest: "A", lowest: "C", median: "B", words: 900 }),
		measures: {
			build: {
				grades: {
					graded: 2,
					highest: "A",
					lowest: "C",
					median: "B",
					state: "available",
				},
				scale: "letters",
			},
			final: { attempts: 2, scale: "successRate", successful: 1 },
		},
	};

	renderBand({ figures: { ...FIGURES, candidate: twoMeasures } });

	const armB = card("CANDIDATE (AFTER)");

	expect(armB).toHaveTextContent("build");
	expect(armB).toHaveTextContent("final");
}
