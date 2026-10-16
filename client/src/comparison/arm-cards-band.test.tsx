import { describe, expect, it } from "bun:test";
import { screen, within } from "@testing-library/react";
import type { ComparisonBaselineArm } from "#benchmark/comparison-baseline-record";
import type { ComparisonArm } from "#benchmark/comparison-record";
import type { StageLetterGrade } from "#benchmark/stage-letter-grades";
import type { ArmFigures } from "#server/comparison-arm-figures";
import type { ArmCorpusVersion } from "#server/comparison-provenance";
import { renderWithRouter } from "#client/test-support/render-app";
import type { ComparisonResponse } from "./comparison-response";
import { ArmCardsBand } from "./arm-cards-band";

const ARM_A_VERSION = "9f30d1".padEnd(64, "0");
const ARM_B_VERSION = "a41c7e".padEnd(64, "0");
const BASELINE_VERSION = "d6a465".padEnd(64, "0");

type CaseFigures = Readonly<Record<ComparisonArm, ArmFigures>>;
type CaseVersions = Readonly<Record<ComparisonArm, ArmCorpusVersion>>;

function lettered(
	median: StageLetterGrade,
	lowest: StageLetterGrade,
	highest: StageLetterGrade,
	words: number,
): ArmFigures {
	return {
		measures: {
			build: {
				scale: "letters",
				grades: { state: "available", median, lowest, highest, graded: 2 },
			},
		},
		cost: { state: "available", totalUsd: 3.31, perAttemptUsd: 1.655 },
		words: { state: "available", averageWords: words, counted: 2, attempts: 2 },
	};
}

const FIGURES = {
	control: lettered("C", "D", "C", 410),
	baseline: lettered("B", "C", "B", 690),
	candidate: lettered("B", "C", "A", 924.6),
} satisfies CaseFigures;

const VERSIONS = {
	control: { state: "available", digest: BASELINE_VERSION },
	baseline: { state: "available", digest: ARM_A_VERSION },
	candidate: { state: "available", digest: ARM_B_VERSION },
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

describe(ArmCardsBand.name, () => {
	it("links each distinct validated source group and keeps the comparison return path", () => {
		renderBand({
			histories: {
				control: [],
				candidate: [],
				baseline: [
					{
						status: "available",
						repId: "rep-1",
						ordinal: 1,
						groupId: "source-a",
						href: "/groups/source-a/reps/rep-1/attempt",
					},
					{
						status: "available",
						repId: "rep-2",
						ordinal: 2,
						groupId: "source-a",
						href: "/groups/source-a/reps/rep-2/attempt",
					},
					{
						status: "available",
						repId: "rep-3",
						ordinal: 3,
						groupId: "source-b",
						href: "/groups/source-b/reps/rep-3/attempt",
					},
				],
			},
		});

		const links = within(card("BASELINE (BEFORE)")).getAllByRole("link");
		expect(
			links.map((link) => [link.textContent, link.getAttribute("href")]),
		).toEqual([
			[
				"Open group 1",
				"/groups/source-a?view=attempts&comparison=comparison-a",
			],
			[
				"Open group 2",
				"/groups/source-b?view=attempts&comparison=comparison-a",
			],
		]);
	});

	it("opens a single validated group without an ordinal suffix", () => {
		renderBand({
			histories: {
				control: [],
				baseline: [],
				candidate: [
					{
						status: "available",
						repId: "rep-1",
						ordinal: 1,
						groupId: "candidate-a",
						href: "/groups/candidate-a/reps/rep-1/attempt",
					},
				],
			},
		});

		expect(
			within(card("CANDIDATE (AFTER)")).getByRole("link", {
				name: "Open group",
			}),
		).toHaveAttribute(
			"href",
			"/groups/candidate-a?view=attempts&comparison=comparison-a",
		);
	});

	it("offers no group destination without a validated available attempt history", () => {
		renderBand({
			histories: {
				control: [],
				baseline: [{ status: "stale", repId: "rep-1", ordinal: 1 }],
				candidate: [],
			},
		});

		expect(within(band()).queryByRole("link")).not.toBeInTheDocument();
	});

	it("orders the cards baseline, baseline (before), candidate (after)", () => {
		renderBand();

		const roles = within(band())
			.getAllByRole("article")
			.map((article) => article.getAttribute("aria-label"));

		expect(roles).toEqual([
			"CONTROL",
			"BASELINE (BEFORE)",
			"CANDIDATE (AFTER)",
		]);
	});

	it("shows an arm's corpus version, its description, and its median of the graded attempts with their range", () => {
		renderBand();

		const armB = card("CANDIDATE (AFTER)");

		expect(armB).toHaveTextContent("corpus@a41c7e");
		expect(armB).toHaveTextContent("after the edit");
		expect(within(armB).getByText("B")).toBeInTheDocument();
		expect(armB).toHaveTextContent("median of 2 · range C – A");
	});

	it("shows an arm's recorded cost beside its average words", () => {
		renderBand();

		const armB = card("CANDIDATE (AFTER)");

		expect(armB).toHaveTextContent("$3.31 · avg 925 words");
	});

	it("describes baseline (before) as the arm before the edit", () => {
		renderBand();

		const armA = card("BASELINE (BEFORE)");

		expect(armA).toHaveTextContent("before the edit");
	});

	it("shows the successes of the attempts on a pass/fail measure", () => {
		const passFail: ArmFigures = {
			...lettered("B", "C", "A", 900),
			measures: {
				checks: { scale: "successRate", successful: 3, attempts: 4 },
			},
		};

		renderBand({ figures: { ...FIGURES, candidate: passFail } });

		const armB = card("CANDIDATE (AFTER)");

		expect(within(armB).getByText("3/4")).toBeInTheDocument();
		expect(armB).toHaveTextContent("3 of 4 attempts passed");
	});

	it("names each measure when an arm has more than one", () => {
		const twoMeasures: ArmFigures = {
			...lettered("B", "C", "A", 900),
			measures: {
				build: {
					scale: "letters",
					grades: {
						state: "available",
						median: "B",
						lowest: "C",
						highest: "A",
						graded: 2,
					},
				},
				final: { scale: "successRate", successful: 1, attempts: 2 },
			},
		};

		renderBand({ figures: { ...FIGURES, candidate: twoMeasures } });

		const armB = card("CANDIDATE (AFTER)");

		expect(armB).toHaveTextContent("build");
		expect(armB).toHaveTextContent("final");
	});

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
		const UNRECORDED: ArmFigures = {
			measures: {
				build: {
					scale: "letters",
					grades: { state: "unavailable", reasons: ["no rep was graded"] },
				},
			},
			cost: { state: "unavailable", reasons: ["rep-1 lacks worker cost"] },
			words: {
				state: "unavailable",
				reasons: ["this report records no word count for its attempts"],
			},
		};

		function unrecordedArmB(): HTMLElement {
			renderBand({
				figures: { ...FIGURES, candidate: UNRECORDED },
				corpusVersions: {
					...VERSIONS,
					candidate: {
						state: "unavailable",
						reasons: ["version not recorded"],
					},
				},
			});

			return card("CANDIDATE (AFTER)");
		}

		it("says the version is not recorded", () => {
			expect(unrecordedArmB()).toHaveTextContent("version not recorded");
		});

		it("says why no grade is shown", () => {
			expect(unrecordedArmB()).toHaveTextContent(
				"grades not recorded: no rep was graded",
			);
		});

		it("says why no cost or words are shown, never a zero", () => {
			const armB = unrecordedArmB();

			expect(armB).toHaveTextContent(
				"cost not recorded: rep-1 lacks worker cost",
			);
			expect(armB).toHaveTextContent(
				"words not recorded: this report records no word count for its attempts",
			);
			expect(armB).not.toHaveTextContent("$0.00");
		});
	});
});
