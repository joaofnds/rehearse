import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import { loadJudgeAgreementReport } from "#benchmark/judge-agreement";
import { writeOperatorGrade } from "#benchmark/operator-grade";
import { operatorGradesDirectory } from "#benchmark/run-layout";
import { FIRST_RUN, writeJudgedStage } from "#server/calibration-case-fixture";
import {
	CalibrationEvidence,
	clearCalibrationRoots,
	fileDigests,
	postGrade,
	recordsDirectory,
} from "#server/calibration-http-fixture";
import OperatorGradeBuilder from "#server/calibration-operator-grade-test-builder";

const RESPONSE_PREFIX_START_INDEX = 0;

afterEach(clearCalibrationRoots);

describe("calibration integrity", () => {
	it(
		"leaves every record that existed byte-identical when a grade is recorded",
		verifyLeavesEveryRecordThatExistedByteIdenticalWhenA,
	);

	it(
		"leaves run history, run detail and the judge agreement report as they were with grades on disk",
		verifyLeavesRunHistoryRunDetailAndTheJudgeAgreement,
	);
});

async function verifyLeavesEveryRecordThatExistedByteIdenticalWhenA(): Promise<void> {
	const lowerBoundForKeysCount = 0;

	const runsDirectory = await recordsDirectory();
	await writeJudgedStage(runsDirectory, {
		dimensions: ["B", "D"],
		run: FIRST_RUN,
	});
	const before = await fileDigests(runsDirectory);

	const response = await postGrade(
		runsDirectory,
		`/api/calibration/runs/${FIRST_RUN}/stages/shape`,
		JSON.stringify(new OperatorGradeBuilder().build()),
	);
	const after = await fileDigests(runsDirectory);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CREATED);
	expect(Object.keys(before).length).toBeGreaterThan(lowerBoundForKeysCount);
	expect(after).toMatchObject(before);
	expect(Object.keys(after).filter((path) => !(path in before))).toEqual([
		join(
			operatorGradesDirectory(runsDirectory),
			"run",
			FIRST_RUN,
			"shape.json",
		),
	]);
}

async function verifyLeavesRunHistoryRunDetailAndTheJudgeAgreement(): Promise<void> {
	const evidence = await CalibrationEvidence.create();

	const before = await evidence.responses();
	const agreementBefore = await loadJudgeAgreementReport(
		evidence.runsDirectory,
	);

	const grade = new OperatorGradeBuilder().build();
	await Array.fromAsync(evidence.gradeRefs, async (ref) => {
		await writeOperatorGrade(evidence.runsDirectory, ref, grade);
	});

	expect(
		before.map((response) =>
			response.slice(RESPONSE_PREFIX_START_INDEX, "200".length),
		),
	).toEqual(["200", "200", "200", "200", "200"]);
	expect(await evidence.responses()).toEqual(before);
	expect(await loadJudgeAgreementReport(evidence.runsDirectory)).toEqual(
		agreementBefore,
	);
}
