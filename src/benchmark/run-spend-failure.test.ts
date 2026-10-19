import { afterEach, describe, expect, it } from "bun:test";

import { failureOf } from "#cli/cli-test-support";

import { runGradedStages } from "./run";
import {
	testResources,
	unexpectedReports,
} from "./run-stage-context-test-fixture";
import {
	answeringProductOwner,
	ceilingContext,
	stageFailureFixture,
} from "./run-stage-spending-test-fixtures";
import { createSpendCeiling } from "./spend-ceiling";
import type { WorkflowStageRequest } from "./workflow";

const recordsFailedCrossingSession = async (): Promise<void> => {
	const { dependencies, persistence, abort } = stageFailureFixture();
	const context = await ceilingContext(abort);
	const sessions = {
		...dependencies,
		runWorkflowStage: async (request: WorkflowStageRequest) => {
			const requestedStageBudgetUsd = 5;
			const chargedCallCostUsd = 1.1;

			request.spendCeiling.budgetFor(requestedStageBudgetUsd);
			request.spendCeiling.charge(chargedCallCostUsd);

			return await Promise.reject(new Error("budget exhausted"));
		},
	};

	const failure = await failureOf(runGradedStages(sessions, context));
	await abort.markAborted(failure.message);

	const stageRecord: unknown = JSON.parse(
		persistence.files.get(context.stageFile("shape")) ?? "",
	);

	expect(stageRecord).toMatchObject({
		ceilingStop: { ceilingUsd: 1, spentUsd: 1.1 },
		stage: "shape",
	});
};

const retainsSpendAfterFailure = async (): Promise<void> => {
	const { dependencies, persistence, abort } = stageFailureFixture();
	const context = await ceilingContext(abort);
	const metrics = {
		cacheReadTokens: 3,
		cacheWriteTokens: 4,
		costUsd: 1.1,
		inputTokens: 1,
		outputTokens: 2,
		turns: 1,
	};
	const sessions = {
		...dependencies,
		readTaskOutput: async () =>
			await Promise.reject(new Error("backlog is gone")),
		runWorkflowStage: async (request: WorkflowStageRequest) => {
			const requestedStageBudgetUsd = 5;
			const chargedCallCostUsd = 1.1;

			request.spendCeiling.budgetFor(requestedStageBudgetUsd);
			request.spendCeiling.charge(chargedCallCostUsd);

			return await Promise.resolve({
				costUsd: 1.1,
				exchanges: [],
				providerCalls: [{ metrics }],
				sessionId: "session",
				stage: request.stage,
			});
		},
	};

	const failure = await failureOf(runGradedStages(sessions, context));
	await abort.markAborted(failure.message);

	const stageRecord: unknown = JSON.parse(
		persistence.files.get(context.stageFile("shape")) ?? "",
	);

	expect(stageRecord).toMatchObject({
		ceilingStop: { ceilingUsd: 1, spentUsd: 1.1 },
		error: "backlog is gone",
		session: { costUsd: 1.1, providerCalls: [{ metrics }] },
		stage: "shape",
	});
};

const recordsUnreadableRubricStop = async (): Promise<void> => {
	const { dependencies, persistence, abort } = stageFailureFixture();
	const ceiling = await ceilingContext(abort);
	const [first, ...rest] = ceiling.pipeline.stages;
	const context = {
		...ceiling,
		pipeline: {
			...ceiling.pipeline,
			stages: [
				...(first === undefined
					? []
					: [{ ...first, rubric: "rubrics/missing.md" }]),
				...rest,
			],
		},
		productOwner: answeringProductOwner,
	};
	const sessions = {
		...dependencies,
		runWorkflowStage: async (request: WorkflowStageRequest) => {
			const chargedCallCostUsd = 1;

			request.spendCeiling.charge(chargedCallCostUsd);

			return await dependencies.runWorkflowStage(request);
		},
	};

	const failure = await failureOf(runGradedStages(sessions, context));
	await abort.markAborted(failure.message);

	const stageRecord: unknown = JSON.parse(
		persistence.files.get(context.stageFile("shape")) ?? "",
	);

	expect(stageRecord).toMatchObject({
		ceilingStop: { ceilingUsd: 1, spentUsd: 1 },
		productOwnerCostUsd: 0.0115,
		stage: "shape",
	});
};

const recordsGroupCeiling = async (): Promise<void> => {
	const earlierGroupSpendUsd = 1;

	const { dependencies, persistence, abort } = stageFailureFixture();
	const group = createSpendCeiling({ ceilingUsd: 1.5 });
	group.charge(earlierGroupSpendUsd);
	const context = {
		...(await ceilingContext(abort)),
		spendCeiling: createSpendCeiling({ ceilingUsd: 1, within: group }),
	};
	const sessions = {
		...dependencies,
		runWorkflowStage: async (request: WorkflowStageRequest) => {
			const requestedStageBudgetUsd = 5;
			const chargedCallCostUsd = 0.6;

			request.spendCeiling.budgetFor(requestedStageBudgetUsd);
			request.spendCeiling.charge(chargedCallCostUsd);

			return await Promise.reject(new Error("budget exhausted"));
		},
	};

	const failure = await failureOf(runGradedStages(sessions, context));
	await abort.markAborted(failure.message);

	const stageRecord: unknown = JSON.parse(
		persistence.files.get(context.stageFile("shape")) ?? "",
	);

	expect(stageRecord).toMatchObject({
		ceilingStop: { ceilingUsd: 1.5, spentUsd: 1.6 },
		stage: "shape",
	});
};

const recordsRefusedSession = async (): Promise<void> => {
	const { dependencies, persistence, abort } = stageFailureFixture();
	const context = await ceilingContext(abort);
	const sessions = {
		...dependencies,
		runWorkflowStage: async (request: WorkflowStageRequest) => {
			const requestedStageBudgetUsd = 5;
			const chargedCallCostUsd = 1.5;

			request.spendCeiling.budgetFor(requestedStageBudgetUsd);
			request.spendCeiling.charge(chargedCallCostUsd);

			return await dependencies.runWorkflowStage(request);
		},
	};

	const failure = await failureOf(runGradedStages(sessions, context));
	await abort.markAborted(failure.message);

	const record: unknown = JSON.parse(
		persistence.files.get(context.stageFile("build")) ?? "",
	);

	expect(record).toMatchObject({
		ceilingStop: { ceilingUsd: 1, spentUsd: 1.5 },
		error: failure.message,
		stage: "build",
		status: "STAGE_JUDGE_FAILED",
	});
};
describe("runGradedStages failed session ceiling", () => {
	it(
		"records the stop when the session crossing the ceiling fails",
		recordsFailedCrossingSession,
	);

	it(
		"keeps a returned session's spend on the stop record when a step after it fails at the ceiling",
		retainsSpendAfterFailure,
	);

	it(
		"records the ceiling stop when the stage's rubric cannot be read at the ceiling",
		recordsUnreadableRubricStop,
	);

	it(
		"records the group's ceiling when a rep's session fails at what the group had left",
		recordsGroupCeiling,
	);

	it(
		"records the stop for a stage whose session the ceiling refused",
		recordsRefusedSession,
	);
});

const RESOURCE_DRAIN_START_INDEX = 0;
testResources.registerCleanup();
afterEach(() => {
	expect(unexpectedReports.splice(RESOURCE_DRAIN_START_INDEX)).toEqual([]);
});
