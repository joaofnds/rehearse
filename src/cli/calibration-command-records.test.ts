import { describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";

import { calibratableArtifactSchema } from "#benchmark/calibration-record";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { loadJudgeAgreementReport } from "#benchmark/judge-agreement";
import { runCalibrate } from "#cli/calibrate-command";
import type { RunFixture } from "#cli/calibrate-test-support";
import {
	writeReview,
	writeRunFixture,
	writeStoppedStageFixture,
} from "#cli/calibrate-test-support";
import {
	CliTestWorkspace,
	failureOf,
	recordOutput,
} from "#cli/cli-test-support";
import { UsageError } from "#cli/command-usage";

import {
	CalibrateRequestBuilder,
	artifactSchema,
	passingProbe,
	storedCeiling,
	unavailableCalibrationJudges,
} from "./calibration-command-test-fixture";

const workspace = CliTestWorkspace.forEachTest();

async function readsAPreCardArtifactAndTheOneIt(): Promise<void> {
	const fixture = await writeRunFixture(workspace);

	const preCard = calibratableArtifactSchema.parse(
		JSON.parse(await Bun.file(fixture.artifactFile).text()),
	);
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

	const postCard = calibratableArtifactSchema.parse(
		JSON.parse(await Bun.file(fixture.artifactFile).text()),
	);
	expect(preCard.status).toBe("AWAITING_HUMAN_REVIEW");
	expect(postCard).toMatchObject({
		resultSha: preCard.resultSha,
		status: "COMPLETE",
	});
	expect(await loadJudgeAgreementReport(fixture.runsDirectory)).toMatchObject({
		skippedCalibrations: 0,
	});
}

async function refusesAStageRubricItCannotRead(): Promise<void> {
	const fixture = await writeRunFixture(workspace);

	await rm(fixture.stageRubricPath);
	await writeReview(fixture.reviewFile, []);
	const { output } = recordOutput();

	const failure = await failureOf(
		runCalibrate(
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
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure?.message).toContain(fixture.stageRubricPath);
	const artifact = artifactSchema.parse(
		JSON.parse(await Bun.file(fixture.artifactFile).text()),
	);
	expect(artifact.status).toBe("AWAITING_HUMAN_REVIEW");
}

async function namesAnEmptyReviewFileRatherThanFailingOn(): Promise<void> {
	const fixture = await writeRunFixture(workspace);

	await Bun.write(fixture.reviewFile, "");
	const { output } = recordOutput();

	const failure = await failureOf(
		runCalibrate(
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
		),
	);

	expect(failure).toBeInstanceOf(UsageError);
	expect(failure?.message).toContain(fixture.reviewFile);
}

async function refusesARunWhoseCaseCannotBeRead(): Promise<void> {
	const fixture = await writeRunFixture(workspace, { caseId: "no-such-case" });

	await writeReview(fixture.reviewFile, []);
	const { output } = recordOutput();

	const failure = await failureOf(
		runCalibrate(
			new CalibrateRequestBuilder({
				readCurrentSources: undefined,
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
	expect(failure?.message).toContain("no-such-case");
	const artifact = artifactSchema.parse(
		JSON.parse(await Bun.file(fixture.artifactFile).text()),
	);
	expect(artifact.status).toBe("AWAITING_HUMAN_REVIEW");
}

const namesTheSFileItCouldNotExamples = [
	[
		"artifact",
		writeRunFixture,
		(fixture: RunFixture): string => fixture.artifactFile,
	],
	[
		"review",
		writeRunFixture,
		(fixture: RunFixture): string => fixture.reviewFile,
	],
	[
		"stage",
		writeStoppedStageFixture,
		(fixture: RunFixture): string => fixture.stageFile,
	],
] as const;

describe(runCalibrate.name, () => {
	it(
		"reads a pre-card artifact and the one it writes through the same parser",
		readsAPreCardArtifactAndTheOneIt,
	);

	describe("when the recorded stage rubric cannot be read", () => {
		it(
			"refuses a stage rubric it cannot read",
			refusesAStageRubricItCannotRead,
		);
	});

	describe("when a saved calibration input contains malformed JSON", () => {
		it.each(namesTheSFileItCouldNotExamples)(
			"names the %s file it could not parse as JSON",
			namesTheFileItCouldNotParseAsJson,
		);
	});

	describe("when the review file is empty", () => {
		it(
			"names an empty review file rather than failing on its bytes",
			namesAnEmptyReviewFileRatherThanFailingOn,
		);
	});

	describe("when the recorded case cannot be read", () => {
		it(
			"refuses a run whose case cannot be read",
			refusesARunWhoseCaseCannotBeRead,
		);
	});
});

async function namesTheFileItCouldNotParseAsJson(
	_kind: string,
	writeFixture: typeof writeRunFixture | typeof writeStoppedStageFixture,
	fileOf: (fixture: RunFixture) => string,
): Promise<void> {
	const fixture = await writeFixture(workspace);

	await writeReview(fixture.reviewFile, []);
	const file = fileOf(fixture);
	await Bun.write(file, '{ "verdict": "ACCEPT",, }');
	const { output } = recordOutput();

	const failure = await failureOf(
		runCalibrate(
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
		),
	);

	expect(failure).toBeInstanceOf(UsageError);
	expect(failure?.message).toContain(file);
}
