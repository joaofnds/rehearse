import { describe, expect, it } from "bun:test";

import { z } from "zod";

import { runCalibrate } from "#cli/calibrate-command";
import {
	RUN_NAME,
	writeReview,
	writeRunFixture,
} from "#cli/calibrate-test-support";
import {
	CliTestWorkspace,
	failureOf,
	recordOutput,
} from "#cli/cli-test-support";
import { UsageError } from "#cli/command-usage";

import {
	CalibrateRequestBuilder,
	FIRST_STAGE_SCORECARD_INDEX,
	passingProbe,
	storedCeiling,
	unavailableCalibrationJudges,
} from "./calibration-command-test-fixture";

const workspace = CliTestWorkspace.forEachTest();

async function writeFutureArtifactFields(artifactFile: string): Promise<void> {
	const original = z
		.looseObject({ stageScorecards: z.tuple([z.looseObject({})]) })
		.parse(JSON.parse(await Bun.file(artifactFile).text()));
	await Bun.write(
		artifactFile,
		JSON.stringify({
			...original,
			laterCardTopLevel: "kept",
			stageScorecards: [
				{
					...original.stageScorecards[FIRST_STAGE_SCORECARD_INDEX],
					laterCardNested: "kept",
				},
			],
		}),
	);
}

const nestedScorecardSchema = z.looseObject({
	laterCardNested: z.string(),
});

async function keepsAFieldItDoesNotKnowAboutWhen(): Promise<void> {
	const fixture = await writeRunFixture(workspace);

	await writeFutureArtifactFields(fixture.artifactFile);
	await writeReview(fixture.reviewFile, []);
	const { output } = recordOutput();

	await runCalibrate(
		new CalibrateRequestBuilder({
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
	);

	const completed = z
		.looseObject({
			laterCardTopLevel: z.string(),
			stageScorecards: z.array(nestedScorecardSchema),
		})
		.parse(JSON.parse(await Bun.file(fixture.artifactFile).text()));
	const [observedFirstStageScorecard] = completed.stageScorecards;

	expect(completed.laterCardTopLevel).toBe("kept");
	expect(observedFirstStageScorecard?.laterCardNested).toBe("kept");
}

async function acceptsTheRunAsRunNameAndRefusesOne(): Promise<void> {
	const fixture = await writeRunFixture(workspace);

	await writeReview(fixture.reviewFile, []);
	const { output } = recordOutput();

	await runCalibrate(
		new CalibrateRequestBuilder({
			id: `run:${RUN_NAME}`,
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
	);

	const failure = await failureOf(
		runCalibrate(
			new CalibrateRequestBuilder({
				id: "run:../escape",
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

	expect(failure).toBeInstanceOf(UsageError);
	expect(failure.message).toContain("outside the runs directory");
}

describe(runCalibrate.name, () => {
	it(
		"keeps a field it does not know about when it completes the artifact",
		keepsAFieldItDoesNotKnowAboutWhen,
	);

	describe("when a run-prefixed identifier attempts to escape the runs directory", () => {
		it(
			"accepts the run as run:<name> and refuses one naming a path outside",
			acceptsTheRunAsRunNameAndRefusesOne,
		);
	});
});
