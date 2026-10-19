import { screen, within } from "@testing-library/react";

import type { ComparisonBaselineArm } from "#benchmark/comparison-baseline-record";
import type { ComparisonArm } from "#benchmark/comparison-record";
import type { StageLetterGrade } from "#benchmark/stage-letter-grades";
import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import { renderWithRouter } from "#client/test-support/render-app";
import type { ArmFigures } from "#server/comparison-arm-figures";
import type { ArmCorpusVersion } from "#server/comparison-provenance";

import ArmCardsBand from "./arm-cards-band";
import type { ComparisonResponse } from "./comparison-response";

const ARM_A_VERSION = "9f30d1".padEnd(SHA256_HEX_CHARACTERS, "0");

const ARM_B_VERSION = "a41c7e".padEnd(SHA256_HEX_CHARACTERS, "0");

const BASELINE_VERSION = "d6a465".padEnd(SHA256_HEX_CHARACTERS, "0");

type CaseFigures = Readonly<Record<ComparisonArm, ArmFigures>>;

type CaseVersions = Readonly<Record<ComparisonArm, ArmCorpusVersion>>;

interface LetteredArmFixture {
	readonly words: number;
	readonly median: StageLetterGrade;
	readonly lowest: StageLetterGrade;
	readonly highest: StageLetterGrade;
}

function lettered({
	median,
	lowest,
	highest,
	words,
}: LetteredArmFixture): ArmFigures {
	return {
		cost: { perAttemptUsd: 1.655, state: "available", totalUsd: 3.31 },
		measures: {
			build: {
				grades: { graded: 2, highest, lowest, median, state: "available" },
				scale: "letters",
			},
		},
		words: { attempts: 2, averageWords: words, counted: 2, state: "available" },
	};
}

const FIGURES = {
	baseline: lettered({ highest: "B", lowest: "C", median: "B", words: 690 }),
	candidate: lettered({ highest: "A", lowest: "C", median: "B", words: 924.6 }),
	control: lettered({ highest: "C", lowest: "D", median: "C", words: 410 }),
} satisfies CaseFigures;

const VERSIONS = {
	baseline: { digest: ARM_A_VERSION, state: "available" },
	candidate: { digest: ARM_B_VERSION, state: "available" },
	control: { digest: BASELINE_VERSION, state: "available" },
} satisfies CaseVersions;

const DERIVED: ComparisonBaselineArm = {
	kind: "derived",
	skillUnderTest: "skills/shape/",
};

function renderBand(
	overrides: Readonly<{
		figures?: CaseFigures;
		corpusVersions?: CaseVersions;
		baselineArm?: ComparisonBaselineArm;
		histories?: ComparisonResponse["attemptHistories"][string];
	}> = {},
): void {
	renderWithRouter(
		<ArmCardsBand
			digest="comparison-a"
			histories={overrides.histories}
			caseId="audit-log"
			showCase={false}
			figures={overrides.figures ?? FIGURES}
			corpusVersions={overrides.corpusVersions ?? VERSIONS}
			baselineArm={overrides.baselineArm ?? DERIVED}
		/>,
	);
}

function band(): HTMLElement {
	return screen.getByRole("region", { name: "Arms · audit-log" });
}

function card(role: string): HTMLElement {
	return within(band()).getByRole("article", { name: role });
}

export { band, card, DERIVED, FIGURES, lettered, renderBand, VERSIONS };
