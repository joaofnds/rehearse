import { afterEach, describe, expect, it } from "bun:test";

import { failureOf } from "#cli/cli-test-support";

import {
	JudgeExecutionError,
	JudgeOutputValidationError,
} from "./judge-attempt";
import JudgeCeilingStopError from "./judge-ceiling-stop-error";
import { runGradedStages } from "./run";
import {
	testResources,
	unexpectedReports,
} from "./run-stage-context-test-fixture";
import { fakeStageDependencies } from "./run-stage-dependencies-test-fixture";
import type { StageJudgeExecution } from "./run-stage-judge-test-fixtures";
import { callMetricsForCost } from "./run-stage-judge-test-fixtures";
import {
	answeringProductOwner,
	atCeiling,
	ceilingContext,
} from "./run-stage-spending-test-fixtures";
import type { WorkflowStageRequest } from "./workflow";
import { runWorkflowStage } from "./workflow";

const REJECTED_JUDGE_CALL_COST_USD = 0.4;
const HALTED_JUDGE_RETRY_COST_USD = 0.6;
const REJECTED_JUDGE_RETRY = {
	attempts: [
		{
			costUsd: 1,
			error: "not a scorecard",
			outcome: "REJECTED",
			payload: { not: "a scorecard" },
		},
	],
	ceilingUsd: 1,
	costUsd: 1,
	prompt: "judge prompt",
	spentUsd: 1,
} satisfies Readonly<
	Pick<
		JudgeCeilingStopError,
		"attempts" | "ceilingUsd" | "costUsd" | "prompt" | "spentUsd"
	>
>;
const refusesInitialWorkerCall = async (): Promise<void> => {
	const chargedCallCostUsd = 1;

	const { dependencies } = fakeStageDependencies();
	const { persistence, abort } = atCeiling();
	const context = await ceilingContext(abort);
	context.spendCeiling.charge(chargedCallCostUsd);
	const sessions = {
		...dependencies,
		runWorkflowStage: async (request: WorkflowStageRequest) =>
			await runWorkflowStage(
				request,
				async () => await Promise.reject(new Error("no call is made")),
			),
	};

	const failure = await failureOf(runGradedStages(sessions, context));
	await abort.markAborted(failure.message);

	const stageRecord: unknown = JSON.parse(
		persistence.files.get(context.stageFile("shape")) ?? "",
	);

	expect(stageRecord).toMatchObject({
		ceilingStop: { ceilingUsd: 1, spentUsd: 1 },
		session: { costUsd: 0, providerCalls: [] },
	});
};

const recordsRejectedJudgeSpend = async (): Promise<void> => {
	const { dependencies } = fakeStageDependencies();
	const { persistence, abort } = atCeiling();
	const context = await ceilingContext(abort);
	const sessions = {
		...dependencies,
		runStageJudge: async ({ budget }: StageJudgeExecution) => {
			const chargedCallCostUsd = 1;

			budget.spendCeiling.charge(chargedCallCostUsd);

			return await Promise.reject(
				new JudgeOutputValidationError({
					attempts: [
						{
							costUsd: 1,
							error: "not a scorecard",
							outcome: "REJECTED",
							payload: { not: "a scorecard" },
						},
					],
					costUsd: 1,
					message: "not a scorecard",
					prompt: "judge prompt",
				}),
			);
		},
	};

	const failure = await failureOf(runGradedStages(sessions, context));
	await abort.markAborted(failure.message);

	const stageRecord: unknown = JSON.parse(
		persistence.files.get(context.stageFile("shape")) ?? "",
	);

	expect(stageRecord).toMatchObject({
		attempts: [{ costUsd: 1, outcome: "REJECTED" }],
		ceilingStop: { ceilingUsd: 1, spentUsd: 1 },
		status: "STAGE_JUDGE_FAILED",
	});
};

const recordsFailedJudgeRetrySpend = async (): Promise<void> => {
	const { dependencies } = fakeStageDependencies();
	const { persistence, abort } = atCeiling();
	const context = await ceilingContext(abort);
	const sessions = {
		...dependencies,
		runStageJudge: async ({ budget }: StageJudgeExecution) => {
			const chargedCallCostUsd = 1;

			budget.spendCeiling.charge(chargedCallCostUsd);

			return await Promise.reject(
				new JudgeExecutionError({
					attempts: [
						{
							costUsd: 0.4,
							error: "not a scorecard",
							metrics: callMetricsForCost(REJECTED_JUDGE_CALL_COST_USD),
							outcome: "REJECTED",
							payload: { not: "a scorecard" },
						},
					],
					cause: new Error("Reached maximum budget"),
					costUsd: 1,
					failedCallMetrics: callMetricsForCost(HALTED_JUDGE_RETRY_COST_USD),
					prompt: "judge prompt",
				}),
			);
		},
	};

	const failure = await failureOf(runGradedStages(sessions, context));
	await abort.markAborted(failure.message);

	const stageRecord: unknown = JSON.parse(
		persistence.files.get(context.stageFile("shape")) ?? "",
	);

	expect(stageRecord).toMatchObject({
		attempts: [{ costUsd: 0.4, outcome: "REJECTED" }],
		ceilingStop: { ceilingUsd: 1, spentUsd: 1 },
		costUsd: 1,
		judgeProviderCalls: [
			{ metrics: callMetricsForCost(REJECTED_JUDGE_CALL_COST_USD) },
			{ metrics: callMetricsForCost(HALTED_JUDGE_RETRY_COST_USD) },
		],
	});
};

const recordsRefusedJudgeRetry = async (): Promise<void> => {
	const { dependencies } = fakeStageDependencies();
	const { persistence, abort } = atCeiling();
	const context = {
		...(await ceilingContext(abort)),
		productOwner: answeringProductOwner,
	};
	const sessions = {
		...dependencies,
		runStageJudge: async ({ budget }: StageJudgeExecution) => {
			const chargedCallCostUsd = 1;

			budget.spendCeiling.charge(chargedCallCostUsd);

			return await Promise.reject(
				new JudgeCeilingStopError(REJECTED_JUDGE_RETRY),
			);
		},
	};

	const failure = await failureOf(runGradedStages(sessions, context));
	await abort.markAborted(failure.message);

	const stageRecord: unknown = JSON.parse(
		persistence.files.get(context.stageFile("shape")) ?? "",
	);

	expect(stageRecord).toMatchObject({
		attempts: [{ costUsd: 1, outcome: "REJECTED" }],
		ceilingStop: { ceilingUsd: 1, spentUsd: 1 },
		costUsd: 1,
		judgeProviderCalls: [{}],
		productOwnerCostUsd: 0.0115,
		productOwnerProviderCalls: [{}],
		prompt: "judge prompt",
		stage: "shape",
		status: "STAGE_JUDGE_FAILED",
	});
};

const retainsPaidJudgeAttempt = async (): Promise<void> => {
	const { dependencies } = fakeStageDependencies();
	const { persistence, abort } = atCeiling();
	const context = await ceilingContext(abort);
	const sessions = {
		...dependencies,
		runStageJudge: async ({ budget }: StageJudgeExecution) => {
			const chargedCallCostUsd = 1;

			budget.spendCeiling.charge(chargedCallCostUsd);

			return await Promise.reject(
				new JudgeCeilingStopError({
					attempts: [],
					ceilingUsd: 1,
					costUsd: 0,
					prompt: "judge prompt",
					spentUsd: 1,
				}),
			);
		},
	};

	const failure = await failureOf(runGradedStages(sessions, context));
	await abort.markAborted(failure.message);

	const stageRecord: unknown = JSON.parse(
		persistence.files.get(context.stageFile("shape")) ?? "",
	);

	expect(stageRecord).toMatchObject({
		attempts: [],
		ceilingStop: { ceilingUsd: 1, spentUsd: 1 },
		judgeProviderCalls: [],
	});
};
describe("runGradedStages judge ceiling", () => {
	it(
		"records a session the ceiling refused before its first call as spending nothing",
		refusesInitialWorkerCall,
	);

	it(
		"records the ceiling stop when the Judge's rejected answer spent to the ceiling",
		recordsRejectedJudgeSpend,
	);

	it(
		"keeps every Judge call on the stop record when the ceiling halts its retry",
		recordsFailedJudgeRetrySpend,
	);

	it(
		"keeps the Judge's paid attempt when the ceiling refuses its retry",
		recordsRefusedJudgeRetry,
	);

	it(
		"records no Judge calls when the ceiling refuses its first attempt",
		retainsPaidJudgeAttempt,
	);
});

const RESOURCE_DRAIN_START_INDEX = 0;
testResources.registerCleanup();
afterEach(() => {
	expect(unexpectedReports.splice(RESOURCE_DRAIN_START_INDEX)).toEqual([]);
});
