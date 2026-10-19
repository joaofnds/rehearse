import { afterEach, describe, it, setSystemTime } from "bun:test";

import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import {
	RunRecordBuilder,
	RunRecordStageBuilder,
} from "#client/test-support/run-detail";

import {
	EARLIER_TIMES,
	MEASURED_AT,
	THREE_STAGE_RECORD,
	expectEstimate,
	renderEstimatedRun,
} from "./monitor-spend-test-fixtures";
import { RUN, originalFetch, renderMonitor } from "./monitor-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
	setSystemTime();
});

describe("/monitor", () => {
	describe("the spend band", () => {
		describe("the remaining estimate", () => {
			it(
				"estimates the steps left from earlier runs of the case, less the running step's time so far, at the burn rate",
				estimatesTheStepsLeftFromEarlierRunsOfTheCaseLessTheRunningStepSTimeSoFarAtTheBurnRate,
			);

			it(
				"counts a running step past its earlier median as nothing left, and still counts the steps after it",
				countsARunningStepPastItsEarlierMedianAsNothingLeftAndStillCountsTheStepsAfterIt,
			);

			it(
				"names the steps after the running one, as the design labels them",
				namesTheStepsAfterTheRunningOneAsTheDesignLabelsThem,
			);

			describe("when it has none", () => {
				it(
					"says no earlier run of the case exists",
					saysNoEarlierRunOfTheCaseExists,
				);

				it(
					"says the run records no run spend to set the rate",
					saysTheRunRecordsNoRunSpendToSetTheRate,
				);

				it(
					"says the run recorded no start for the running step",
					saysTheRunRecordedNoStartForTheRunningStep,
				);

				it(
					"says every step has finished while the run's final judge returns",
					saysEveryStepHasFinishedWhileTheRunSFinalJudgeReturns,
				);

				it(
					"says when it could not read the earlier runs",
					saysWhenItCouldNotReadTheEarlierRuns,
				);
			});
		});
	});
});

async function estimatesTheStepsLeftFromEarlierRunsOfTheCaseLessTheRunningStepSTimeSoFarAtTheBurnRate(): Promise<void> {
	renderEstimatedRun({ stageElapsedMs: 40_000 });

	await expectEstimate("Remaining step 3, at current rate≈ $2.07 · 7m");
}

async function countsARunningStepPastItsEarlierMedianAsNothingLeftAndStillCountsTheStepsAfterIt(): Promise<void> {
	renderEstimatedRun({ stageElapsedMs: 440_000 });

	await expectEstimate("Remaining step 3, at current rate≈ $0.59 · 2m");
}

async function namesTheStepsAfterTheRunningOneAsTheDesignLabelsThem(): Promise<void> {
	const monitorRow = new PipelineRunRowBuilder({ run: RUN })
		.withExecutionProgress()
		.build();
	const fetchOverrides = new Map<string, unknown>([
		[
			`/api/runs/${RUN}`,
			new RunRecordBuilder({
				run: RUN,
				stages: [
					new RunRecordStageBuilder({
						stage: "plan",
						status: "graded",
					}).build(),
					new RunRecordStageBuilder().build(),
					new RunRecordStageBuilder({ stage: "review" }).build(),
					new RunRecordStageBuilder({ stage: "ship" }).build(),
				],
			}).build(),
		],
	]);
	renderMonitor(monitorRow, fetchOverrides);

	await expectEstimate("Remaining steps 3 to 4, at current rate");
}

async function saysNoEarlierRunOfTheCaseExists(): Promise<void> {
	renderEstimatedRun(
		{ stageElapsedMs: 40_000 },
		{
			stages: ["plan", "build", "review"].map((stage) => ({
				reasons: ["no prior run of this case"],
				stage,
				state: "unavailable",
			})),
		},
	);

	await expectEstimate(
		"Remaining step 3, at current rate— no prior run of this case",
	);
}

async function saysTheRunRecordsNoRunSpendToSetTheRate(): Promise<void> {
	setSystemTime(new Date(MEASURED_AT));
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN })
			.withExecutionProgress({ stageElapsedMs: 100_000 })
			.build(),
		new Map<string, unknown>([
			[`/api/runs/${RUN}`, THREE_STAGE_RECORD],
			[`/api/runs/${RUN}/stage-times`, EARLIER_TIMES],
		]),
	);

	await expectEstimate(
		"Remaining step 3, at current rate— run spend not recorded",
	);
}

async function saysTheRunRecordedNoStartForTheRunningStep(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN })
			.withExecutionProgress({ runSpentUsd: 1.83 })
			.build(),
		new Map<string, unknown>([
			[`/api/runs/${RUN}`, THREE_STAGE_RECORD],
			[`/api/runs/${RUN}/stage-times`, EARLIER_TIMES],
		]),
	);

	await expectEstimate(
		"Remaining step 3, at current rate— the running step's start is not recorded",
	);
}

async function saysEveryStepHasFinishedWhileTheRunSFinalJudgeReturns(): Promise<void> {
	setSystemTime(new Date(MEASURED_AT));
	const monitorRow = new PipelineRunRowBuilder({ run: RUN })
		.withExecutionProgress({
			elapsedMs: 372_000,
			measuredAt: MEASURED_AT,
			runSpentUsd: 1.83,
			stageElapsedMs: 100_000,
		})
		.build();
	const fetchOverrides = new Map<string, unknown>([
		[
			`/api/runs/${RUN}`,
			new RunRecordBuilder({
				finalOutcome: { stage: "review", status: "PENDING" },
				run: RUN,
				stages: [
					new RunRecordStageBuilder({
						stage: "plan",
						status: "graded",
					}).build(),
					new RunRecordStageBuilder({
						stage: "build",
						status: "graded",
					}).build(),
					new RunRecordStageBuilder({
						stage: "review",
						status: "graded",
					}).build(),
				],
			}).build(),
		],
		[`/api/runs/${RUN}/stage-times`, EARLIER_TIMES],
	]);
	renderMonitor(monitorRow, fetchOverrides);

	await expectEstimate("Remaining, at current rate— every step has finished");
}

async function saysWhenItCouldNotReadTheEarlierRuns(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN })
			.withExecutionProgress({ runSpentUsd: 1.83 })
			.build(),
	);

	await expectEstimate(
		"Remaining step 2, at current rate— could not read the earlier runs of this case",
	);
}
