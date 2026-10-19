import { afterEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { constants as HTTP_STATUS } from "node:http2";

import type { JsonValue } from "#benchmark/json-value";
import { FIRST_RUN, writeJudgedStage } from "#server/calibration-case-fixture";
import {
	clearCalibrationRoots,
	fileDigests,
	postGrade,
	recordsDirectory,
} from "#server/calibration-http-fixture";
import OperatorGradeBuilder from "#server/calibration-operator-grade-test-builder";

afterEach(clearCalibrationRoots);

const UNAVAILABLE_GRADE_TARGETS = [
	[
		"an unknown stage",
		`/api/calibration/runs/${FIRST_RUN}/stages/build`,
		HTTP_STATUS.HTTP_STATUS_NOT_FOUND,
	],
	[
		"an unknown run",
		"/api/calibration/runs/2026-01-01T00-00-00.000Z/stages/shape",
		HTTP_STATUS.HTTP_STATUS_NOT_FOUND,
	],
	[
		"a traversing segment, resolved away before any route matches",
		`/api/calibration/runs/${FIRST_RUN}/stages/..`,
		HTTP_STATUS.HTTP_STATUS_NOT_FOUND,
	],
	[
		"an encoded slash",
		`/api/calibration/runs/${FIRST_RUN}/stages/a%2Fb`,
		HTTP_STATUS.HTTP_STATUS_BAD_REQUEST,
	],
	[
		"an encoded traversal, resolved away before any route matches",
		"/api/calibration/runs/%2E%2E/stages/shape",
		HTTP_STATUS.HTTP_STATUS_NOT_FOUND,
	],
] as const;

const INVALID_OPERATOR_GRADES = [
	[
		"a letter outside A to F",
		{
			...new OperatorGradeBuilder().build(),
			dimensions: [
				{ grade: "E", id: "clarity" },
				{ grade: "B", id: "decision-quality" },
			],
		},
	],
	[
		"a status outside PASS and FAIL",
		{
			...new OperatorGradeBuilder().build(),
			requirements: [{ id: "goal-stated", status: "PARTIAL" }],
		},
	],
	[
		"a missing criterion",
		new OperatorGradeBuilder({
			dimensions: [{ grade: "B", id: "clarity" }],
		}).build(),
	],
	[
		"an extra criterion",
		new OperatorGradeBuilder({
			requirements: [
				{ id: "goal-stated", status: "PASS" },
				{ id: "tests-named", status: "PASS" },
			],
		}).build(),
	],
	[
		"a repeated criterion",
		new OperatorGradeBuilder({
			dimensions: [
				{ grade: "B", id: "clarity" },
				{ grade: "B", id: "clarity" },
			],
		}).build(),
	],
	[
		"a field the grade does not have",
		{ ...new OperatorGradeBuilder().build(), grade: "A" },
	],
] as const;

const INVALID_STAGE_IDENTITIES = [
	`/api/calibration/runs/${FIRST_RUN}/stages/a%2Fb`,
	"/api/calibration/groups/group-a/reps/rep-a/stages/a%2Fb",
	"/api/calibration/replays/lineage-a/a%2Fb",
];

describe("calibration refusals", () => {
	it.each(UNAVAILABLE_GRADE_TARGETS)(
		"refuses %s and writes nothing",
		verifyUnavailableGradeTargets,
	);

	it.each(INVALID_OPERATOR_GRADES)(
		"refuses %s and writes nothing",
		verifyInvalidOperatorGrades,
	);

	it.each(INVALID_STAGE_IDENTITIES)(
		"validates the stage identity before parsing a malformed grade at %s",
		verifyInvalidStageIdentities,
	);

	it(
		"refuses a second grade for a stage already graded and keeps the first",
		verifyRefusesASecondGradeForAStageAlreadyGraded,
	);

	it(
		"refuses a run and stage split at another dot of the same record and writes nothing",
		verifyRefusesARunAndStageSplitAtAnotherDot,
	);
});

async function verifyRefusesASecondGradeForAStageAlreadyGraded(): Promise<void> {
	const runsDirectory = await recordsDirectory();
	await writeJudgedStage(runsDirectory, {
		dimensions: ["B", "B"],
		run: FIRST_RUN,
	});
	const path = `/api/calibration/runs/${FIRST_RUN}/stages/shape`;
	await postGrade(
		runsDirectory,
		path,
		JSON.stringify(new OperatorGradeBuilder().build()),
	);
	const before = await fileDigests(runsDirectory);

	const second = await postGrade(
		runsDirectory,
		path,
		JSON.stringify(
			new OperatorGradeBuilder({
				dimensions: [
					{ grade: "A", id: "clarity" },
					{ grade: "A", id: "decision-quality" },
				],
			}).build(),
		),
	);

	expect(second.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(await fileDigests(runsDirectory)).toEqual(before);
}

async function verifyRefusesARunAndStageSplitAtAnotherDot(): Promise<void> {
	const runsDirectory = await recordsDirectory();
	await writeJudgedStage(runsDirectory, {
		dimensions: ["B", "B"],
		run: FIRST_RUN,
	});
	const before = await fileDigests(runsDirectory);
	const [run, milliseconds] = FIRST_RUN.split(".");

	const response = await postGrade(
		runsDirectory,
		`/api/calibration/runs/${run}/stages/${milliseconds}.shape`,
		JSON.stringify(new OperatorGradeBuilder().build()),
	);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
	expect(await fileDigests(runsDirectory)).toEqual(before);
}

async function verifyUnavailableGradeTargets(
	_case: string,
	path: string,
	status: number,
): Promise<void> {
	const runsDirectory = await recordsDirectory();
	await writeJudgedStage(runsDirectory, {
		dimensions: ["B", "B"],
		run: FIRST_RUN,
	});
	const before = await fileDigests(runsDirectory);

	const response = await postGrade(
		runsDirectory,
		path,
		JSON.stringify(new OperatorGradeBuilder().build()),
	);

	expect(response.status).toBe(status);
	expect(await fileDigests(runsDirectory)).toEqual(before);
}

async function verifyInvalidOperatorGrades(
	_case: string,
	grade: OperatorGradeCandidate,
): Promise<void> {
	const runsDirectory = await recordsDirectory();
	await writeJudgedStage(runsDirectory, {
		dimensions: ["B", "B"],
		run: FIRST_RUN,
	});
	const before = await fileDigests(runsDirectory);

	const response = await postGrade(
		runsDirectory,
		`/api/calibration/runs/${FIRST_RUN}/stages/shape`,
		JSON.stringify(grade),
	);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
	expect(await fileDigests(runsDirectory)).toEqual(before);
}

async function verifyInvalidStageIdentities(
	path: Readonly<(typeof INVALID_STAGE_IDENTITIES)[number]>,
): Promise<void> {
	const expectedStatus = 400;

	const runsDirectory = await recordsDirectory();
	await mkdir(runsDirectory, { recursive: true });
	const before = await fileDigests(runsDirectory);

	const response = await postGrade(runsDirectory, path, "{");

	expect(response.status).toBe(expectedStatus);
	expect(await response.json()).toEqual({
		error: "a/b names no recorded stage",
	});
	expect(await fileDigests(runsDirectory)).toEqual(before);
}

type OperatorGradeCandidate = Readonly<Record<string, JsonValue | undefined>>;
