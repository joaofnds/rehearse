import { describe, expect, it } from "bun:test";

import { z } from "zod";

import type { JudgeResult } from "#benchmark/judge";
import type { JudgeKnobs } from "#cli/calibrate-command";
import { runCalibrate } from "#cli/calibrate-command";
import {
	FINAL_RUBRIC,
	stageRubricText,
	writeReview,
	writeRunFixture,
	writeStoppedStageFixture,
} from "#cli/calibrate-test-support";
import { CliTestWorkspace, recordOutput } from "#cli/cli-test-support";

import {
	CalibrateRequestBuilder,
	MISSED_SCOPE,
	REVISED_FINAL_JUDGE_RESULT,
	artifactSchema,
	passingProbe,
	rejudgingStage,
	stageRubricPathsSchema,
	storedCeiling,
	unavailableCalibrationJudges,
} from "./calibration-command-test-fixture";

const workspace = CliTestWorkspace.forEachTest();

async function recordsTheFinalRubricEditAndItsRevisedGrade(): Promise<void> {
	const fixture = await writeRunFixture(workspace);

	await writeReview(fixture.reviewFile, [
		{
			description: "The final Judge missed the worker defect.",
			judgeAssessment: "MISSED",
			paths: ["src/audit/worker.ts"],
			rubricId: "worker-metadata",
			stage: "final",
		},
	]);
	const controlRubric = `${FINAL_RUBRIC}4. \`worker-metadata\`: The row keeps request metadata.\n`;

	await runCalibrate(
		new CalibrateRequestBuilder({
			confirmRejudge: true,
			readCurrentSources: async () =>
				await Promise.resolve({
					finalRubric: controlRubric,
					instructions: "Instructions",
				}),
			runsDirectory: fixture.runsDirectory,
		}).build(),
		{
			buildJudges: () => ({
				finalJudge: async () =>
					await Promise.resolve<JudgeResult>(REVISED_FINAL_JUDGE_RESULT),
				stageJudge: async () =>
					await Promise.reject(new Error("no stage rejudge")),
			}),
			output: recordOutput().output,
			probeModel: passingProbe,
			requireSpendCeiling: storedCeiling,
		},
	);

	const artifact = artifactSchema.parse(
		JSON.parse(await Bun.file(fixture.artifactFile).text()),
	);
	expect(artifact.status).toBe("COMPLETE");
	expect(artifact.calibration?.rejudgeConfirmedByHuman).toBe(true);
}

async function completesAStoppedStageSRecordWhenNoArtifact(): Promise<void> {
	const fixture = await writeStoppedStageFixture(workspace);

	await Bun.write(
		fixture.stageRubricPath,
		stageRubricText("Scope is explicit and observable"),
	);
	await writeReview(fixture.reviewFile, [MISSED_SCOPE]);
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

	const record = z
		.object({
			calibration: z.object({
				stageRubricsChanged: stageRubricPathsSchema,
			}),
			judgeAgreement: z.object({ skippedCalibrations: z.number() }),
		})
		.loose()
		.parse(JSON.parse(await Bun.file(fixture.stageFile).text()));
	expect(record.calibration.stageRubricsChanged).toEqual(["discuss"]);
	expect(record.judgeAgreement).toMatchObject({ skippedCalibrations: 0 });
	expect(stdout).toEqual([`${fixture.stageFile}\n`]);
}

async function rejudgesAStoppedStageUnderTheJudgeKnobsThe(): Promise<void> {
	const fixture = await writeStoppedStageFixture(workspace);

	await Bun.write(
		fixture.stageRubricPath,
		stageRubricText("Scope is explicit and observable"),
	);
	await writeReview(fixture.reviewFile, [MISSED_SCOPE]);
	const { output } = recordOutput();
	const knobs: JudgeKnobs[] = [];

	await runCalibrate(
		new CalibrateRequestBuilder({
			confirmRejudge: true,
			runsDirectory: fixture.runsDirectory,
		}).build(),
		{
			buildJudges: (recorded, spendCeiling) => {
				knobs.push(recorded);

				return rejudgingStage()(recorded, spendCeiling);
			},
			output,
			probeModel: passingProbe,
			requireSpendCeiling: storedCeiling,
		},
	);

	expect(knobs).toEqual([
		{ judgeEffort: "medium", judgeModel: "sonnet", sessionBudgetUsd: 5 },
	]);
}

async function calibratesAStageRecordWrittenWithoutTheJudgeKnobs(): Promise<void> {
	const fixture = await writeStoppedStageFixture(workspace, {
		judgeModel: "sonnet",
	});

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

	const record = z
		.object({
			calibration: z.object({ stageRubricsChanged: stageRubricPathsSchema }),
			judgeAgreement: z.object({ skippedCalibrations: z.number() }),
		})
		.loose()
		.parse(JSON.parse(await Bun.file(fixture.stageFile).text()));
	expect(record.calibration.stageRubricsChanged).toEqual([]);
	expect(record.judgeAgreement).toMatchObject({ skippedCalibrations: 0 });
}

describe(runCalibrate.name, () => {
	it(
		"records the final rubric edit and its revised grade",
		recordsTheFinalRubricEditAndItsRevisedGrade,
	);
	it(
		"completes a stopped stage's record when no artifact was written",
		completesAStoppedStageSRecordWhenNoArtifact,
	);
	it(
		"rejudges a stopped stage under the Judge knobs the record froze",
		rejudgesAStoppedStageUnderTheJudgeKnobsThe,
	);
	it(
		"calibrates a stage record written without the Judge knobs",
		calibratesAStageRecordWrittenWithoutTheJudgeKnobs,
	);
});
