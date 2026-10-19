import { describe, expect, it } from "bun:test";

import runPipelineConfirmation from "./pipeline-confirmation";
import { readReps } from "./pipeline-confirmation-record-test-reader";
import { readResourceReport } from "./pipeline-confirmation-report-test-reader";
import PipelineStageJudgeFailureFake from "./pipeline-confirmation-stage-judge-test-fake";
import {
	CONFIRMATION_METRIC,
	PipelineConfirmationHarness,
} from "./pipeline-confirmation-test-support";
import { TestResources } from "./test-support";

const SECOND_RECORDED_STAGE_INDEX = 1;

const testResources = TestResources.forEachTest();

async function keepsTheAttemptAStageJudgePaidForWhenTheCeilingRefusesItsRetry(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);

	const outcome = await harness.run(
		{
			groupId: "stage-judge-ceiling",
			projectedCost: {
				perRepMaximumUsd: 45,
				reps: 2,
				totalMaximumUsd: 90,
			},
			reps: 2,
		},
		PipelineStageJudgeFailureFake.ceiling().override,
	);
	const records = await readReps(outcome);
	const [failed] = records;

	expect(failed?.metrics).toEqual({
		calls: [
			{ metrics: CONFIRMATION_METRIC, role: "worker" },
			{ metrics: CONFIRMATION_METRIC, role: "worker" },
			{ metrics: CONFIRMATION_METRIC, role: "stage-judge" },
			{ metrics: CONFIRMATION_METRIC, role: "stage-judge" },
		],
		status: "COMPLETE",
	});
}

async function marksALaterStageJudgeInvocationFailureAsAMissingProviderCall(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);

	const outcome = await harness.run(
		{
			groupId: "stage-judge-metrics",
			projectedCost: {
				perRepMaximumUsd: 45,
				reps: 2,
				totalMaximumUsd: 90,
			},
			reps: 2,
		},
		PipelineStageJudgeFailureFake.invocation().override,
	);
	const records = await readReps(outcome);
	const [failed] = records;

	expect(failed?.stages[SECOND_RECORDED_STAGE_INDEX]).toMatchObject({
		error: "stage Judge invocation failed",
		status: "EXECUTION_FAILED",
	});
	expect(failed?.metrics).toEqual({
		calls: [
			{ metrics: CONFIRMATION_METRIC, role: "worker" },
			{ metrics: CONFIRMATION_METRIC, role: "worker" },
			{ metrics: CONFIRMATION_METRIC, role: "stage-judge" },
			{ metrics: CONFIRMATION_METRIC, role: "stage-judge" },
		],
		missing: ["stage-judge call metrics"],
		status: "MISSING",
	});
}

describe(runPipelineConfirmation.name, () => {
	describe("when a stage judge cannot finish its invocation", () => {
		it(
			"reports the stage judge failure without discarding earlier costs",
			reportsTheStageJudgeFailureWithoutDiscardingEarlierCosts,
		);
		it(
			"keeps the attempt a stage Judge paid for when the ceiling refuses its retry",
			keepsTheAttemptAStageJudgePaidForWhenTheCeilingRefusesItsRetry,
		);
		it(
			"marks a later stage Judge invocation failure as a missing provider call",
			marksALaterStageJudgeInvocationFailureAsAMissingProviderCall,
		);
	});
});

async function reportsTheStageJudgeFailureWithoutDiscardingEarlierCosts(): Promise<void> {
	const expectedPaidStageJudgeCostUsd = 1.25;
	const harness = await PipelineConfirmationHarness.setup(testResources);

	const outcome = await harness.run(
		{
			groupId: "stage-judge-metrics",
			projectedCost: { perRepMaximumUsd: 45, reps: 2, totalMaximumUsd: 90 },
			reps: 2,
		},
		PipelineStageJudgeFailureFake.invocation().override,
	);
	const report = await readResourceReport(outcome);

	expect(report.reliability).toEqual([
		{
			gradeDistribution: Object.fromEntries(
				[{ count: 2, grade: "A" }].map(({ grade, count }) => [grade, count]),
			),
			name: "discuss",
			successful: 1,
		},
		{
			gradeDistribution: Object.fromEntries(
				[{ count: 1, grade: "A" }].map(({ grade, count }) => [grade, count]),
			),
			name: "build",
			successful: 1,
		},
		{ gradeDistribution: { PASS: 1 }, name: "final", successful: 1 },
	]);
	expect(report.resources).toEqual({
		completeReps: 1,
		missingMetricReps: 1,
		total: { costUsd: [expectedPaidStageJudgeCostUsd] },
	});
}
