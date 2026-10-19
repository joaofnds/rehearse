import { describe, expect, it } from "bun:test";

import type { ComparisonBaselineArm } from "#benchmark/comparison-baseline-record";
import type { ArmFigures } from "#server/comparison-arm-figures";

import {
	DERIVED,
	FIGURES,
	VERSIONS,
	card,
	renderBand,
} from "./arm-card-test-fixtures";
import ArmCardsBand from "./arm-cards-band";

const UNRECORDED: ArmFigures = {
	cost: { reasons: ["rep-1 lacks worker cost"], state: "unavailable" },
	measures: {
		build: {
			grades: { reasons: ["no rep was graded"], state: "unavailable" },
			scale: "letters",
		},
	},
	words: {
		reasons: ["this report records no word count for its attempts"],
		state: "unavailable",
	},
};

function unrecordedArmB(): HTMLElement {
	renderBand({
		corpusVersions: {
			...VERSIONS,
			candidate: {
				reasons: ["version not recorded"],
				state: "unavailable",
			},
		},
		figures: { ...FIGURES, candidate: UNRECORDED },
	});

	return card("CANDIDATE (AFTER)");
}

describe(ArmCardsBand.name, () => {
	it.each([
		{
			baselineArm: DERIVED,
			description: "skill under test removed · skills/shape/",
		},
		{
			baselineArm: {
				kind: "armA",
				skillUnderTest: "skills/shape/",
			} satisfies ComparisonBaselineArm,
			description: "baseline (before) run unchanged",
		},
		{
			baselineArm: { kind: "supplied" } satisfies ComparisonBaselineArm,
			description: "minimal corpus",
		},
		{
			baselineArm: {
				kind: "unreadable",
				reason: "baseline.json: JSON Parse error",
			} satisfies ComparisonBaselineArm,
			description: "baseline.json: JSON Parse error",
		},
	])(
		"describes a $baselineArm.kind baseline arm as $description",
		({ baselineArm, description }) => {
			renderBand({ baselineArm });

			const baseline = card("CONTROL");

			expect(baseline).toHaveTextContent(description);
		},
	);

	describe("when an arm's records lack a figure", () => {
		it("says the version is not recorded", saysTheVersionIsNotRecorded);

		it("says why no grade is shown", saysWhyNoGradeIsShown);

		it(
			"says why no cost or words are shown, never a zero",
			saysWhyNoCostOrWordsAreShownNeverAZero,
		);
	});
});

function saysTheVersionIsNotRecorded(): void {
	expect(unrecordedArmB()).toHaveTextContent("version not recorded");
}

function saysWhyNoGradeIsShown(): void {
	expect(unrecordedArmB()).toHaveTextContent(
		"grades not recorded: no rep was graded",
	);
}

function saysWhyNoCostOrWordsAreShownNeverAZero(): void {
	const armB = unrecordedArmB();

	expect(armB).toHaveTextContent("cost not recorded: rep-1 lacks worker cost");
	expect(armB).toHaveTextContent(
		"words not recorded: this report records no word count for its attempts",
	);
	expect(armB).not.toHaveTextContent("$0.00");
}
