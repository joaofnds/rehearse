import { afterEach, describe, expect, it } from "bun:test";

import { z } from "zod";

import { failureOf } from "#cli/cli-test-support";

import { runGradedStages } from "./run";
import type { StageDependencies } from "./run";
import {
	testResources,
	unexpectedReports,
} from "./run-stage-context-test-fixture";
import { fakeStageDependencies } from "./run-stage-dependencies-test-fixture";
import { readPersistedStageRecord } from "./run-stage-evidence-test-fixtures";
import type {
	StageJudgeExecution,
	StageJudgment,
} from "./run-stage-judge-test-fixtures";
import { atCeiling, ceilingContext } from "./run-stage-spending-test-fixtures";
import { SpendCeilingReachedError } from "./spend-ceiling";

const expectedBudgetCount = 2;
const expectedBudgets = 0.4;
const expectedSpentUsd = 1.2;
const RESOURCE_DRAIN_START_INDEX = 0;
const budgetRecordSchema = z.object({
	ceilingStop: z.object({
		ceilingUsd: z.number(),
		spentUsd: z.number(),
	}),
	error: z.string(),
	stage: z.string(),
	status: z.string(),
});
const budgetsEverySession = async (): Promise<void> => {
	const { dependencies, scorecardFor } = fakeStageDependencies();
	const { abort } = atCeiling();
	const context = await ceilingContext(abort);
	const budgets: number[] = [];
	const sessions = {
		...dependencies,
		runStageJudge: async (
			{ budget }: StageJudgeExecution,
			{ input }: StageJudgment,
		) => {
			budget.spendCeiling.budgetFor(budget.sessionBudgetUsd);

			return await Promise.resolve(scorecardFor(input, "CONTINUE"));
		},
		runWorkflowStage: async (request) => {
			const requestedStageBudgetUsd = 5;
			const chargedCallCostUsd = 0.6;

			budgets.push(request.spendCeiling.budgetFor(requestedStageBudgetUsd));
			request.spendCeiling.charge(chargedCallCostUsd);

			return await dependencies.runWorkflowStage(request);
		},
	} satisfies StageDependencies;

	const failure = await failureOf(runGradedStages(sessions, context));

	const [, observedSecondBudget] = budgets;

	expect(failure).toBeInstanceOf(SpendCeilingReachedError);
	expect(budgets).toHaveLength(expectedBudgetCount);
	expect(observedSecondBudget).toBeCloseTo(expectedBudgets);
};
const recordsCrossingSession = async (): Promise<void> => {
	const { dependencies, scorecardFor } = fakeStageDependencies();
	const { persistence, abort } = atCeiling();
	const context = await ceilingContext(abort);
	const sessions = {
		...dependencies,
		runStageJudge: async (
			{ budget }: StageJudgeExecution,
			{ input }: StageJudgment,
		) => {
			budget.spendCeiling.budgetFor(budget.sessionBudgetUsd);

			return await Promise.resolve(scorecardFor(input, "CONTINUE"));
		},
		runWorkflowStage: async (request) => {
			const requestedStageBudgetUsd = 5;
			const chargedCallCostUsd = 0.6;

			request.spendCeiling.budgetFor(requestedStageBudgetUsd);
			request.spendCeiling.charge(chargedCallCostUsd);

			return await dependencies.runWorkflowStage(request);
		},
	} satisfies StageDependencies;

	const failure = await failureOf(runGradedStages(sessions, context));
	await abort.markAborted(failure.message);

	const record = readPersistedStageRecord(
		persistence,
		context.stageFile("build"),
		budgetRecordSchema,
	);

	expect(record).toMatchObject({
		ceilingStop: { ceilingUsd: 1 },
		error: failure.message,
		stage: "build",
		status: "STAGE_JUDGE_FAILED",
	});
	expect(record.ceilingStop.spentUsd).toBeCloseTo(expectedSpentUsd);
};
describe("runGradedStages budget allocation", () => {
	it(
		"starts the next session within what is left and no session after it",
		budgetsEverySession,
	);
	it(
		"stops in that session's stage with a record naming the ceiling and the spend",
		recordsCrossingSession,
	);
});

testResources.registerCleanup();
afterEach(() => {
	expect(unexpectedReports.splice(RESOURCE_DRAIN_START_INDEX)).toEqual([]);
});
