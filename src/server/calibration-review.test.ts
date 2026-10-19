import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import {
	FIRST_RUN,
	INPUT,
	JUDGE_CLAIM,
	JUDGE_SUMMARY,
	RUBRIC,
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

describe("calibration review", () => {
	it(
		"serves the frozen input and the rubric before grading, and nothing the Judge returned",
		verifyServesTheFrozenInputAndTheRubricBeforeGrading,
	);

	it(
		"serves each input field the Judge read as text, a structured one as indented JSON",
		verifyServesEachInputFieldTheJudgeReadAsText,
	);

	it(
		"returns the Judge's grade for the same stage once the operator's is recorded",
		verifyReturnsTheJudgeSGradeForTheSameStage,
	);
});

async function verifyServesTheFrozenInputAndTheRubricBeforeGrading(): Promise<void> {
	const runsDirectory = await recordsDirectory();
	await writeJudgedStage(runsDirectory, {
		dimensions: ["B", "D"],
		run: FIRST_RUN,
	});

	const response = await appFor(runsDirectory).request(
		`/api/calibration/runs/${FIRST_RUN}/stages/shape`,
	);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	const body = await response.text();
	expect(JSON.parse(body)).toEqual({
		criteria: RUBRIC,
		input: INPUT,
		judgeModel: "opus",
		stage: { kind: "run", run: FIRST_RUN, stage: "shape" },
		stageName: "shape",
	});
	expect(body).not.toContain(JUDGE_SUMMARY);
	expect(body).not.toContain(JUDGE_CLAIM);
	expect(body).not.toContain("PASS");
	expect(body).not.toContain('"D"');
}

async function verifyServesEachInputFieldTheJudgeReadAsText(): Promise<void> {
	const runsDirectory = await recordsDirectory();
	await writeJudgedStage(runsDirectory, {
		dimensions: ["B", "D"],
		input: {
			baselineContext: [{ path: "AGENTS.md" }],
			task: "Implement the audit log",
		},
		run: FIRST_RUN,
	});

	const response = await appFor(runsDirectory).request(
		`/api/calibration/runs/${FIRST_RUN}/stages/shape`,
	);

	expect(await response.json()).toMatchObject({
		input: {
			baselineContext: '[\n  {\n    "path": "AGENTS.md"\n  }\n]',
			task: "Implement the audit log",
		},
	});
}

async function verifyReturnsTheJudgeSGradeForTheSameStage(): Promise<void> {
	const runsDirectory = await recordsDirectory();
	await writeJudgedStage(runsDirectory, {
		dimensions: ["B", "D"],
		run: FIRST_RUN,
	});
	const path = `/api/calibration/runs/${FIRST_RUN}/stages/shape`;

	const recorded = await postGrade(
		runsDirectory,
		path,
		JSON.stringify(
			new OperatorGradeBuilder({
				dimensions: [
					{ grade: "A", id: "clarity" },
					{ grade: "B", id: "decision-quality" },
				],
			}).build(),
		),
	);
	const review = await appFor(runsDirectory).request(path);

	expect(recorded.status).toBe(HTTP_STATUS.HTTP_STATUS_CREATED);
	expect(await recorded.json()).toMatchObject({
		judgeGrade: { grade: "D", summary: JUDGE_SUMMARY },
		operatorGrade: { grade: "B" },
	});
	expect(await review.json()).toMatchObject({
		input: INPUT,
		judgeGrade: {
			grade: "D",
			hardBlockers: [{ evidence: [{ claim: JUDGE_CLAIM }] }],
			summary: JUDGE_SUMMARY,
		},
		operatorGrade: { grade: "B" },
	});
}
