import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";

import CalibrationPage from "./calibration-page";
import type { CalibrationResponse } from "./calibration-query";
import {
	DIFF_HYGIENE_REVIEW_COUNT,
	TOTAL_DIFF_HYGIENE_DRIFT_STEPS,
	originalFetch,
	renderCalibration,
	reportWith,
} from "./calibration-test-fixtures";

const CONTRACT_CHOICES = 2;

const groups: CalibrationResponse["groups"] = [
	{
		drift: [{ dimension: "clarity", steps: 1 }],
		judgeContractSha256: "a".repeat(SHA256_HEX_CHARACTERS),
		judgeModel: "opus",
		reviews: 2,
		rubricSha256: "abc123def456".padEnd(SHA256_HEX_CHARACTERS, "0"),
		stage: "shape",
	},
	{
		drift: [{ dimension: "diff-hygiene", steps: -1 }],
		judgeContractSha256: "a".repeat(SHA256_HEX_CHARACTERS),
		judgeModel: null,
		reviews: 1,
		rubricSha256: null,
		stage: "build",
	},
];

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(CalibrationPage.name, () => {
	it(
		"shows each dimension's drift as a signed value over a seven-cell bar, or agrees",
		showsEachDimensionSDriftAsASignedValueOverASevenCellBarOrAgrees,
	);

	it(
		"rounds a drift and its mirror to the same size, half a tenth away from agreement",
		roundsADriftAndItsMirrorToTheSameSizeHalfATenthAwayFromAgreement,
	);

	it(
		"names the Judge model, step and rubric each drift figure belongs to",
		namesTheJudgeModelStepAndRubricEachDriftFigureBelongsTo,
	);

	it(
		"selects both contracts when the model, stage and rubric are the same",
		selectsBothContracts,
	);
	it(
		"explains why unknown historical identities do not contribute drift",
		explainsUnknownIdentities,
	);

	describe("when grades span more than one Judge model or rubric", () => {
		it(
			"shows the group with the most operator grades first, never a mean across groups",
			showsTheGroupWithTheMostOperatorGradesFirstNeverAMeanAcrossGroups,
		);

		it("switches to another group's drift", switchesToAnotherGroupSDrift);
	});
});

async function showsEachDimensionSDriftAsASignedValueOverASevenCellBarOrAgrees(): Promise<void> {
	renderCalibration(
		reportWith({
			groups: [
				{
					drift: [
						{ dimension: "evidence-quality", steps: 0.7 },
						{ dimension: "verbosity-control", steps: 0.5 },
						{ dimension: "scope-discipline", steps: 0.04 },
						{
							dimension: "diff-hygiene",
							steps: TOTAL_DIFF_HYGIENE_DRIFT_STEPS / DIFF_HYGIENE_REVIEW_COUNT,
						},
						{ dimension: "clarity", steps: 2 },
						{ dimension: "goal-stated", steps: 0.36 },
					],
					judgeContractSha256: "a".repeat(SHA256_HEX_CHARACTERS),
					judgeModel: "opus",
					reviews: 3,
					rubricSha256: "a".repeat(SHA256_HEX_CHARACTERS),
					stage: "shape",
				},
			],
			reviews: 3,
			withinOneStep: 3,
		}),
	);

	const aside = await screen.findByRole("complementary", {
		name: "Where the judge drifts",
	});
	const items = within(aside)
		.getAllByRole("listitem")
		.map((item) => item.textContent);

	expect(items).toEqual([
		"evidence-qualityjudge +0.7 steps▮▮▮▮▯▯▯",
		"verbosity-controljudge +0.5 steps▮▮▮▯▯▯▯",
		"scope-disciplineagrees▮▯▯▯▯▯▯",
		"diff-hygienejudge −0.3 steps▮▮▯▯▯▯▯",
		"clarityjudge +2.0 steps▮▮▮▮▮▮▮",
		"goal-statedjudge +0.4 steps▮▮▯▯▯▯▯",
	]);
	expect(aside).toHaveTextContent(
		"Calibration does not change a grade. It tells you how much to trust one.",
	);
}

async function roundsADriftAndItsMirrorToTheSameSizeHalfATenthAwayFromAgreement(): Promise<void> {
	renderCalibration(
		reportWith({
			groups: [
				{
					drift: [
						{ dimension: "evidence-quality", steps: 0.25 },
						{ dimension: "verbosity-control", steps: -0.25 },
						{ dimension: "scope-discipline", steps: 0.05 },
						{ dimension: "diff-hygiene", steps: -0.05 },
					],
					judgeContractSha256: "a".repeat(SHA256_HEX_CHARACTERS),
					judgeModel: "opus",
					reviews: 4,
					rubricSha256: "a".repeat(SHA256_HEX_CHARACTERS),
					stage: "shape",
				},
			],
			reviews: 4,
			withinOneStep: 4,
		}),
	);

	const aside = await screen.findByRole("complementary", {
		name: "Where the judge drifts",
	});

	expect(
		within(aside)
			.getAllByRole("listitem")
			.map((item) => item.textContent),
	).toEqual([
		"evidence-qualityjudge +0.3 steps▮▮▯▯▯▯▯",
		"verbosity-controljudge −0.3 steps▮▮▯▯▯▯▯",
		"scope-disciplinejudge +0.1 steps▮▯▯▯▯▯▯",
		"diff-hygienejudge −0.1 steps▮▯▯▯▯▯▯",
	]);
}

async function namesTheJudgeModelStepAndRubricEachDriftFigureBelongsTo(): Promise<void> {
	renderCalibration(
		reportWith({
			groups: [
				{
					drift: [{ dimension: "clarity", steps: 1 }],
					judgeContractSha256: "a".repeat(SHA256_HEX_CHARACTERS),
					judgeModel: "opus",
					reviews: 1,
					rubricSha256: "abc123def456".padEnd(SHA256_HEX_CHARACTERS, "0"),
					stage: "shape",
				},
			],
			reviews: 1,
			withinOneStep: 1,
		}),
	);

	const aside = await screen.findByRole("complementary", {
		name: "Where the judge drifts",
	});

	expect(aside).toHaveTextContent(
		"opus · shape · rubric abc123def456 · contract aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa · 1 review",
	);
	expect(within(aside).queryByRole("combobox")).not.toBeInTheDocument();
}

async function showsTheGroupWithTheMostOperatorGradesFirstNeverAMeanAcrossGroups(): Promise<void> {
	renderCalibration(reportWith({ groups, reviews: 3, withinOneStep: 3 }));

	const aside = await screen.findByRole("complementary", {
		name: "Where the judge drifts",
	});

	expect(
		within(aside)
			.getAllByRole("listitem")
			.map((item) => item.textContent),
	).toEqual(["clarityjudge +1.0 steps▮▮▮▮▮▯▯"]);
	expect(
		within(aside).getByRole("combobox", { name: "Judge group" }),
	).toHaveDisplayValue(
		"opus · shape · rubric abc123def456 · contract aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa · 2 reviews",
	);
}

async function switchesToAnotherGroupSDrift(): Promise<void> {
	renderCalibration(reportWith({ groups, reviews: 3, withinOneStep: 3 }));
	const aside = await screen.findByRole("complementary", {
		name: "Where the judge drifts",
	});

	const other = within(aside).getByRole<HTMLOptionElement>("option", {
		name: "Judge model not recorded · build · rubric not recorded · contract aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa · 1 review",
	});
	fireEvent.change(
		within(aside).getByRole("combobox", { name: "Judge group" }),
		{ target: { value: other.value } },
	);

	expect(
		within(aside)
			.getAllByRole("listitem")
			.map((item) => item.textContent),
	).toEqual(["diff-hygienejudge −1.0 steps▮▮▮▮▮▯▯"]);
}

async function selectsBothContracts(): Promise<void> {
	const [first] = groups;
	if (first === undefined) {
		throw new Error("missing drift group");
	}
	const secondContract = "b".repeat(SHA256_HEX_CHARACTERS);
	renderCalibration(
		reportWith({
			groups: [
				first,
				{
					...first,
					drift: [{ dimension: "clarity", steps: -1 }],
					judgeContractSha256: secondContract,
				},
			],
			reviews: 4,
		}),
	);
	const aside = await screen.findByRole("complementary", {
		name: "Where the judge drifts",
	});
	expect(within(aside).getAllByRole("option")).toHaveLength(CONTRACT_CHOICES);
	const other = within(aside).getByRole<HTMLOptionElement>("option", {
		name: new RegExp(secondContract, "u"),
	});

	fireEvent.change(within(aside).getByRole("combobox"), {
		target: { value: other.value },
	});

	expect(within(aside).getByRole("listitem")).toHaveTextContent(
		"clarityjudge −1.0 steps",
	);
}

async function explainsUnknownIdentities(): Promise<void> {
	renderCalibration(reportWith({ excludedUnknownJudgeReviews: 2, reviews: 2 }));

	const aside = await screen.findByRole("complementary", {
		name: "Where the judge drifts",
	});

	expect(aside).toHaveTextContent(
		"2 reviews excluded from drift because Judge instruction identity was not recorded. Individual reviews remain available.",
	);
	expect(within(aside).queryByRole("list")).not.toBeInTheDocument();
}
