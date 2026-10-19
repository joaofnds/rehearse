import { describe, expect, it } from "bun:test";

import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { assembleRootCauseBundle } from "#benchmark/root-cause-bundle";
import serializeRootCauseBundle from "#benchmark/root-cause-bundle-format";
import { runCalibrate } from "#cli/calibrate-command";
import { RUN_NAME } from "#cli/calibrate-test-support";
import {
	CliTestWorkspace,
	failureOf,
	recordOutput,
} from "#cli/cli-test-support";

import {
	byteRejudges,
	calibrationByteSources,
	revisedCalibrationByteSources,
	writeCalibrationByteFixture,
} from "./calibration-bytes-test-fixture";
import {
	CalibrateRequestBuilder,
	artifactSchema,
	fixtureWithEditedStageRubric,
	noRejudge,
	passingProbe,
	rejudgingStage,
	storedCeiling,
} from "./calibration-command-test-fixture";

const workspace = CliTestWorkspace.forEachTest();

async function refusesARejudgeWithoutConfirmRejudgeAndWritesNothing(): Promise<void> {
	const fixture = await fixtureWithEditedStageRubric(workspace);
	const before = await Bun.file(fixture.artifactFile).text();
	const { output, stdout, stderr } = recordOutput();

	const failure = await failureOf(
		runCalibrate(
			new CalibrateRequestBuilder({
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

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(stdout).toEqual([]);
	expect(stderr.join("")).toContain("scope");
	expect(await Bun.file(fixture.artifactFile).text()).toBe(before);
}

async function completesTheArtifactWithConfirmRejudge(): Promise<void> {
	const fixture = await fixtureWithEditedStageRubric(workspace);
	const { output, stdout } = recordOutput();

	await runCalibrate(
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
	);

	const artifact = artifactSchema.parse(
		JSON.parse(await Bun.file(fixture.artifactFile).text()),
	);
	expect(artifact.status).toBe("COMPLETE");
	expect(artifact.calibration?.rejudgeConfirmedByHuman).toBe(true);
	expect(artifact.calibration?.stageRubricsChanged).toEqual(["discuss"]);
	expect(artifact.judgeAgreement).toMatchObject({ skippedCalibrations: 0 });
	expect(stdout).toEqual([`${fixture.artifactFile}\n`]);
}

const preservesOriginalCalibratedNameRecordAndDownstreamExamples = [
	{
		buildJudges: noRejudge(),
		kind: "stage",
		name: "stage",
		readCurrentSources: calibrationByteSources,
		rejudge: false,
	},
	{
		buildJudges: noRejudge(),
		kind: "final",
		name: "final",
		readCurrentSources: calibrationByteSources,
		rejudge: false,
	},
	{
		buildJudges: byteRejudges,
		kind: "stage",
		name: "stage-rejudged",
		readCurrentSources: revisedCalibrationByteSources,
		rejudge: true,
	},
	{
		buildJudges: byteRejudges,
		kind: "final",
		name: "final-rejudged",
		readCurrentSources: revisedCalibrationByteSources,
		rejudge: true,
	},
] as const;

describe(runCalibrate.name, () => {
	it(
		"completes the artifact with --confirm-rejudge",
		completesTheArtifactWithConfirmRejudge,
	);

	it.each([...preservesOriginalCalibratedNameRecordAndDownstreamExamples])(
		"preserves original calibrated $name record and downstream bundle bytes",
		preservesOriginalCalibratedRecordAndDownstreamBytes,
	);

	describe("when a revised grade has no human rejudge confirmation", () => {
		it(
			"refuses a rejudge without --confirm-rejudge and writes nothing",
			refusesARejudgeWithoutConfirmRejudgeAndWritesNothing,
		);
	});
});

async function preservesOriginalCalibratedRecordAndDownstreamBytes({
	buildJudges,
	kind,
	name,
	readCurrentSources,
	rejudge,
}: (typeof preservesOriginalCalibratedNameRecordAndDownstreamExamples)[number]): Promise<void> {
	const fixture = await writeCalibrationByteFixture(
		{ kind, rejudge },
		workspace,
	);
	const expectedRecord = await Bun.file(
		new URL(
			`__fixtures__/calibration-bytes/${name}-completed.txt`,
			import.meta.url,
		),
	).text();
	const expectedBundle = await Bun.file(
		new URL(
			`__fixtures__/calibration-bytes/${name}-bundle.txt`,
			import.meta.url,
		),
	).text();
	const { output } = recordOutput();

	await runCalibrate(
		new CalibrateRequestBuilder({
			confirmRejudge: rejudge,
			readCurrentSources,
			runsDirectory: fixture.directory,
		}).build(),
		{
			buildJudges,
			output,
			probeModel: passingProbe,
			requireSpendCeiling: storedCeiling,
		},
	);
	const persisted = await Bun.file(fixture.recordFile).text();
	const bundle = await assembleRootCauseBundle(fixture.directory, RUN_NAME);

	// Goldens came from public runCalibrate on all-src d020bf3a. Only
	// the temporary directory is normalized; arbitrary later fields stay.
	expect(persisted.replaceAll(fixture.directory, "__RUNS__")).toBe(
		expectedRecord,
	);
	expect(serializeRootCauseBundle(bundle)).toBe(expectedBundle);
}
