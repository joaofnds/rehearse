import { afterEach, describe, expect, it } from "bun:test";

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

const DIGEST_WIDTH = 64;
const FIRST_CONTRACT = "a".repeat(DIGEST_WIDTH);
const SECOND_CONTRACT = "b".repeat(DIGEST_WIDTH);

afterEach(clearCalibrationRoots);

async function gradeBoth(runsDirectory: string): Promise<void> {
	await Array.fromAsync([FIRST_RUN, SECOND_RUN], async (run) => {
		await postGrade(
			runsDirectory,
			`/api/calibration/runs/${run}/stages/shape`,
			JSON.stringify(new OperatorGradeBuilder().build()),
		);
	});
}

describe("calibration Judge instruction identity", () => {
	it(
		"keeps different contracts apart with otherwise identical grouping inputs",
		separatesContracts,
	);
	it(
		"keeps unknown historical judgments reviewable and out of drift means",
		excludesUnknownIdentity,
	);
});

async function separatesContracts(): Promise<void> {
	const runsDirectory = await recordsDirectory();
	await writeJudgedStage(runsDirectory, {
		dimensions: ["A", "A"],
		judgeContractSha256: FIRST_CONTRACT,
		run: FIRST_RUN,
	});
	await writeJudgedStage(runsDirectory, {
		dimensions: ["D", "D"],
		judgeContractSha256: SECOND_CONTRACT,
		run: SECOND_RUN,
	});

	await gradeBoth(runsDirectory);
	const response = await appFor(runsDirectory).request("/api/calibration");

	expect(await response.json()).toMatchObject({
		excludedUnknownJudgeReviews: 0,
		groups: [
			{
				drift: [{ steps: 1 }, { steps: 1 }],
				judgeContractSha256: FIRST_CONTRACT,
				reviews: 1,
			},
			{
				drift: [{ steps: -2 }, { steps: -2 }],
				judgeContractSha256: SECOND_CONTRACT,
				reviews: 1,
			},
		],
	});
}

async function excludesUnknownIdentity(): Promise<void> {
	const runsDirectory = await recordsDirectory();
	await writeJudgedStage(runsDirectory, {
		dimensions: ["A", "A"],
		judgeContractSha256: null,
		run: FIRST_RUN,
	});
	await writeJudgedStage(runsDirectory, {
		dimensions: ["D", "D"],
		judgeContractSha256: null,
		run: SECOND_RUN,
	});

	await gradeBoth(runsDirectory);
	const response = await appFor(runsDirectory).request("/api/calibration");

	expect(await response.json()).toMatchObject({
		excludedUnknownJudgeReviews: 2,
		groups: [],
		reviews: 2,
		rows: [{ judgeGrade: "A" }, { judgeGrade: "D" }],
	});
}
