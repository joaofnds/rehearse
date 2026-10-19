import { afterEach, describe, expect, it } from "bun:test";

import { failureOf } from "#cli/cli-test-support";

import {
	budgetHaltEnvelope,
	workerQuestionResult,
} from "./claude-test-fixtures";
import ProductOwnerInputsBuilder from "./product-owner-inputs-builder";
import { runGradedStages } from "./run";
import {
	testResources,
	unexpectedReports,
} from "./run-stage-context-test-fixture";
import { fakeStageDependencies } from "./run-stage-dependencies-test-fixture";
import {
	answeringProductOwner,
	atCeiling,
	ceilingContext,
} from "./run-stage-spending-test-fixtures";
import { createSpendCeiling } from "./spend-ceiling";
import type { WorkflowStageRequest } from "./workflow";
import { createProductOwner, runWorkflowStage } from "./workflow";

const HALTED_SESSION_COST_USD = 0.5782854;
const QUESTION_TURN_COST_USD = 0.203;

const recordsWorkerHaltSpend = async (): Promise<void> => {
	const { dependencies } = fakeStageDependencies();
	const { persistence, abort } = atCeiling();
	const context = {
		...(await ceilingContext(abort)),
		productOwner: answeringProductOwner,
		spendCeiling: createSpendCeiling({ ceilingUsd: 0.5 }),
	};
	const responses = [workerQuestionResult(), await budgetHaltEnvelope()];
	const sessions = {
		...dependencies,
		runWorkflowStage: async (request: WorkflowStageRequest) =>
			await runWorkflowStage(
				request,
				async () => await Promise.resolve(responses.shift() ?? ""),
			),
	};

	const failure = await failureOf(runGradedStages(sessions, context));
	await abort.markAborted(failure.message);

	const stageRecord: unknown = JSON.parse(
		persistence.files.get(context.stageFile("shape")) ?? "",
	);

	expect(stageRecord).toMatchObject({
		ceilingStop: { ceilingUsd: 0.5, spentUsd: 0.5782854 },
		productOwnerCostUsd: 0.0115,
		productOwnerProviderCalls: [{}],
		session: {
			costUsd: 0.5782854,
			providerCalls: [
				{},
				{
					metrics: {
						costUsd: HALTED_SESSION_COST_USD - QUESTION_TURN_COST_USD,
					},
				},
			],
		},
		stage: "shape",
	});
};

const recordsProductOwnerHaltSpend = async (): Promise<void> => {
	const { dependencies } = fakeStageDependencies();
	const { persistence, abort } = atCeiling();
	const spendCeiling = createSpendCeiling({ ceilingUsd: 0.5 });
	const context = {
		...(await ceilingContext(abort)),
		productOwner: createProductOwner(
			new ProductOwnerInputsBuilder({ spendCeiling }).build(),
			async () => await budgetHaltEnvelope(),
		),
		spendCeiling,
	};
	const sessions = {
		...dependencies,
		runWorkflowStage: async (request: WorkflowStageRequest) =>
			await runWorkflowStage(
				request,
				async () => await Promise.resolve(workerQuestionResult()),
			),
	};

	const failure = await failureOf(runGradedStages(sessions, context));
	await abort.markAborted(failure.message);

	const stageRecord: unknown = JSON.parse(
		persistence.files.get(context.stageFile("shape")) ?? "",
	);

	expect(stageRecord).toMatchObject({
		ceilingStop: {
			ceilingUsd: 0.5,
			spentUsd: QUESTION_TURN_COST_USD + HALTED_SESSION_COST_USD,
		},
		productOwnerCostUsd: 0.5782854,
		productOwnerProviderCalls: [{ metrics: { costUsd: 0.5782854 } }],
		session: { costUsd: 0.203, providerCalls: [{}] },
	});
};

describe("runGradedStages session ceiling", () => {
	it(
		"keeps what the halted session and the Product Owner spent on its stop record",
		recordsWorkerHaltSpend,
	);

	it(
		"keeps a Product Owner call the ceiling halted on the stop record",
		recordsProductOwnerHaltSpend,
	);
});

const RESOURCE_DRAIN_START_INDEX = 0;
testResources.registerCleanup();
afterEach(() => {
	expect(unexpectedReports.splice(RESOURCE_DRAIN_START_INDEX)).toEqual([]);
});
