import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import type { JsonObject } from "#benchmark/json-value";
import {
	FIRST_RUN,
	SECOND_RUN,
	writeJudgedStage,
} from "#server/calibration-case-fixture";
import {
	appFor,
	clearCalibrationRoots,
	postGrade,
	recordsDirectory,
} from "#server/calibration-http-fixture";
import OperatorGradeBuilder from "#server/calibration-operator-grade-test-builder";

afterEach(clearCalibrationRoots);

const AGREEMENT_OBSERVATIONS = [
	[
		"dimension drift",
		{
			groups: [
				{
					drift: [
						{ dimension: "clarity", steps: -1 },
						{ dimension: "decision-quality", steps: -1 },
					],
					judgeModel: "opus",
					stage: "shape",
				},
			],
		},
	],
	["header figures", { reviews: 2, withinOneStep: 1 }],
	[
		"graded stage rows",
		{
			rows: [
				{
					judgeGrade: "B",
					operatorGrade: "B",
					stage: { kind: "run", run: FIRST_RUN, stage: "shape" },
					stepsApart: 0,
				},
				{
					judgeGrade: "D",
					operatorGrade: "B",
					stage: { kind: "run", run: SECOND_RUN, stage: "shape" },
					stepsApart: 2,
				},
			],
		},
	],
] as const;

describe("calibration agreement", () => {
	it.each(AGREEMENT_OBSERVATIONS)(
		"reports the recorded reviews' %s",
		verifyAgreementObservations,
	);

	it(
		"carries the operator's note and each criterion they graded apart into the agreement row",
		verifyCarriesTheOperatorSNoteAndEachCriterionThey,
	);

	it(
		"counts a grade one letter step from the Judge's as agreeing, and names a requirement graded apart",
		verifyCountsAGradeOneLetterStepFromTheJudge,
	);

	it(
		"derives the operator's letter by the Judge's rule: a failed requirement caps A, A at C",
		verifyDerivesTheOperatorSLetterByTheJudgeS,
	);

	it(
		"keeps each Judge model's drift apart",
		verifyKeepsEachJudgeModelSDriftApart,
	);
});

async function verifyCarriesTheOperatorSNoteAndEachCriterionThey(): Promise<void> {
	const runsDirectory = await recordsDirectory();
	await writeJudgedStage(runsDirectory, {
		dimensions: ["B", "D"],
		run: FIRST_RUN,
	});
	await postGrade(
		runsDirectory,
		`/api/calibration/runs/${FIRST_RUN}/stages/shape`,
		JSON.stringify(
			new OperatorGradeBuilder({
				note: "judge accepted an unverified claim",
			}).build(),
		),
	);

	const response = await appFor(runsDirectory).request("/api/calibration");

	expect(await response.json()).toMatchObject({
		rows: [
			{
				differences: [
					{ criterion: "decision-quality", judge: "D", operator: "B" },
				],
				note: "judge accepted an unverified claim",
			},
		],
	});
}

async function verifyCountsAGradeOneLetterStepFromTheJudge(): Promise<void> {
	const runsDirectory = await recordsDirectory();
	await writeJudgedStage(runsDirectory, {
		dimensions: ["B", "D"],
		run: FIRST_RUN,
	});
	await postGrade(
		runsDirectory,
		`/api/calibration/runs/${FIRST_RUN}/stages/shape`,
		JSON.stringify(
			new OperatorGradeBuilder({
				requirements: [{ id: "goal-stated", status: "FAIL" }],
			}).build(),
		),
	);

	const response = await appFor(runsDirectory).request("/api/calibration");

	expect(await response.json()).toMatchObject({
		reviews: 1,
		rows: [
			{
				differences: [
					{ criterion: "goal-stated", judge: "PASS", operator: "FAIL" },
					{ criterion: "decision-quality", judge: "D", operator: "B" },
				],
				judgeGrade: "D",
				operatorGrade: "C",
				stepsApart: 1,
			},
		],
		withinOneStep: 1,
	});
}

async function verifyDerivesTheOperatorSLetterByTheJudgeS(): Promise<void> {
	const runsDirectory = await recordsDirectory();
	await writeJudgedStage(runsDirectory, {
		dimensions: ["A", "A"],
		run: FIRST_RUN,
	});

	const response = await postGrade(
		runsDirectory,
		`/api/calibration/runs/${FIRST_RUN}/stages/shape`,
		JSON.stringify(
			new OperatorGradeBuilder({
				dimensions: [
					{ grade: "A", id: "clarity" },
					{ grade: "A", id: "decision-quality" },
				],
				requirements: [{ id: "goal-stated", status: "FAIL" }],
			}).build(),
		),
	);

	expect(await response.json()).toMatchObject({
		operatorGrade: { grade: "C" },
	});
}

async function verifyKeepsEachJudgeModelSDriftApart(): Promise<void> {
	const runsDirectory = await recordsDirectory();
	await writeJudgedStage(runsDirectory, {
		dimensions: ["A", "A"],
		judgeModel: "opus",
		run: FIRST_RUN,
	});
	await writeJudgedStage(runsDirectory, {
		dimensions: ["D", "D"],
		judgeModel: "sonnet",
		run: SECOND_RUN,
	});
	await Array.fromAsync([FIRST_RUN, SECOND_RUN], async (run) => {
		await postGrade(
			runsDirectory,
			`/api/calibration/runs/${run}/stages/shape`,
			JSON.stringify(new OperatorGradeBuilder().build()),
		);
	});

	const response = await appFor(runsDirectory).request("/api/calibration");

	expect(await response.json()).toMatchObject({
		groups: [
			{ drift: [{ steps: 1 }, { steps: 1 }], judgeModel: "opus" },
			{ drift: [{ steps: -2 }, { steps: -2 }], judgeModel: "sonnet" },
		],
	});
}

async function verifyAgreementObservations(
	_reading: string,
	expected: Readonly<JsonObject>,
): Promise<void> {
	const runsDirectory = await recordsDirectory();

	await writeJudgedStage(runsDirectory, {
		dimensions: ["B", "B"],
		run: FIRST_RUN,
	});

	await writeJudgedStage(runsDirectory, {
		dimensions: ["D", "D"],
		run: SECOND_RUN,
	});

	await postGrade(
		runsDirectory,
		`/api/calibration/runs/${FIRST_RUN}/stages/shape`,
		JSON.stringify(new OperatorGradeBuilder().build()),
	);

	await postGrade(
		runsDirectory,
		`/api/calibration/runs/${SECOND_RUN}/stages/shape`,
		JSON.stringify(new OperatorGradeBuilder().build()),
	);

	const response = await appFor(runsDirectory).request("/api/calibration");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toMatchObject(expected);
}
