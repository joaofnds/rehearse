import { describe, expect, it } from "bun:test";

import { CalibrationIncompleteError } from "#benchmark/calibration";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { runCalibrate } from "#cli/calibrate-command";
import { writeReview, writeRunFixture } from "#cli/calibrate-test-support";
import {
	CliTestWorkspace,
	failureOf,
	recordOutput,
} from "#cli/cli-test-support";

import {
	CalibrateRequestBuilder,
	MISSED_SCOPE,
	artifactSchema,
	passingProbe,
	rejudgingStage,
	storedCeiling,
	unavailableCalibrationJudges,
} from "./calibration-command-test-fixture";

const workspace = CliTestWorkspace.forEachTest();

async function completesWithoutConfirmRejudgeWhenNothingChanged(): Promise<void> {
	const fixture = await writeRunFixture(workspace);

	await writeReview(fixture.reviewFile, []);
	const { output } = recordOutput();

	await runCalibrate(
		new CalibrateRequestBuilder({
			runsDirectory: fixture.runsDirectory,
		}).build(),
		{
			buildJudges: () =>
				unavailableCalibrationJudges({
					final: "no final rejudge was needed",
					stage: "no stage rejudge was needed",
				}),
			output,
			probeModel: passingProbe,
			requireSpendCeiling: storedCeiling,
		},
	);

	const artifact = artifactSchema.parse(
		JSON.parse(await Bun.file(fixture.artifactFile).text()),
	);
	expect(artifact.status).toBe("COMPLETE");
	expect(artifact.calibration?.rejudgeConfirmedByHuman).toBeUndefined();
	expect(artifact.calibration?.stageRubricsChanged).toEqual([]);
}

async function refusesAReviewInconsistentWithTheGradesAndLeaves(): Promise<void> {
	const fixture = await writeRunFixture(workspace);

	await writeReview(fixture.reviewFile, [
		{ ...MISSED_SCOPE, judgeAssessment: "CAUGHT" },
	]);
	const { output, stderr } = recordOutput();

	const failure = await failureOf(
		runCalibrate(
			new CalibrateRequestBuilder({
				confirmRejudge: true,
				runsDirectory: fixture.runsDirectory,
			}).build(),
			{
				buildJudges: rejudgingStage(),
				output,
				probeModel: passingProbe,
				requireSpendCeiling: storedCeiling,
			},
		),
	);

	expect(failure).toBeInstanceOf(CalibrationIncompleteError);
	expect(stderr.join("")).toContain("did not catch");
	const artifact = artifactSchema.parse(
		JSON.parse(await Bun.file(fixture.artifactFile).text()),
	);
	expect(artifact.status).toBe("AWAITING_HUMAN_REVIEW");
}

async function refusesARunWithNoReviewFileAndMakes(): Promise<void> {
	const fixture = await writeRunFixture(workspace);

	const { output } = recordOutput();

	const failure = await failureOf(
		runCalibrate(
			new CalibrateRequestBuilder({
				confirmRejudge: true,
				runsDirectory: fixture.runsDirectory,
			}).build(),
			{
				buildJudges: () =>
					unavailableCalibrationJudges({
						final: "no provider call",
						stage: "no provider call",
					}),
				output,
				probeModel: passingProbe,
				requireSpendCeiling: storedCeiling,
			},
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain(".review.json");
}

async function refusesARunAlreadyCOMPLETEWithoutRejudging(): Promise<void> {
	const fixture = await writeRunFixture(workspace, { status: "COMPLETE" });

	await writeReview(fixture.reviewFile, []);
	const { output } = recordOutput();

	const failure = await failureOf(
		runCalibrate(
			new CalibrateRequestBuilder({
				confirmRejudge: true,
				runsDirectory: fixture.runsDirectory,
			}).build(),
			{
				buildJudges: () =>
					unavailableCalibrationJudges({
						final: "no provider call",
						stage: "no provider call",
					}),
				output,
				probeModel: passingProbe,
				requireSpendCeiling: storedCeiling,
			},
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain("COMPLETE");
}

describe(runCalibrate.name, () => {
	it(
		"completes without --confirm-rejudge when nothing changed",
		completesWithoutConfirmRejudgeWhenNothingChanged,
	);

	describe("when the human review contradicts the recorded grades", () => {
		it(
			"refuses a review inconsistent with the grades and leaves the artifact",
			refusesAReviewInconsistentWithTheGradesAndLeaves,
		);
	});

	describe("when the human review file is absent", () => {
		it(
			"refuses a run with no review file and makes no provider call",
			refusesARunWithNoReviewFileAndMakes,
		);
	});

	describe("when the run is already complete", () => {
		it(
			"refuses a run already COMPLETE without rejudging",
			refusesARunAlreadyCOMPLETEWithoutRejudging,
		);
	});
});
