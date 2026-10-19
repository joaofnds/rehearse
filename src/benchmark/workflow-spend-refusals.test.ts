import { describe, expect, it } from "bun:test";

import { failureOf } from "#cli/cli-test-support";

import { SpendCeilingReachedError, createSpendCeiling } from "./spend-ceiling";
import StageSessionError from "./stage-session-error";
import { runWorkflowStage } from "./workflow";
import {
	answer,
	productOwnerFor,
	questionTurn,
	stageResult,
	testResources,
	workflowStageRequest,
} from "./workflow-test-fixtures";

testResources.registerCleanup();

const INITIAL_PRODUCT_OWNER_REPLY_COST_USD = 0.1;

const CALL_COUNT_INCREMENT = 1;

async function startsNoWorkerTurn(): Promise<void> {
	const chargedCallCostUsd = 1;

	const expectedCalls = 0;

	const spendCeiling = createSpendCeiling({ ceilingUsd: 1 });
	spendCeiling.charge(chargedCallCostUsd);
	let calls = 0;

	const failure = await failureOf(
		runWorkflowStage(workflowStageRequest({ spendCeiling }), async () => {
			calls += CALL_COUNT_INCREMENT;
			return await Promise.resolve(stageResult({ totalCostUsd: 0.1 }));
		}),
	);

	expect(failure.cause).toBeInstanceOf(SpendCeilingReachedError);
	expect(failure).toMatchObject({ costUsd: 0, providerCalls: [] });
	expect(calls).toBe(expectedCalls);
}

async function carriesTheSessionSCallsOutOfARefusedLaterTurn(): Promise<void> {
	const spendCeiling = createSpendCeiling({ ceilingUsd: 1 });

	const failure = await failureOf(
		runWorkflowStage(
			workflowStageRequest({ spendCeiling }),
			async () => await Promise.resolve(questionTurn({ totalCostUsd: 1 })),
		),
	);

	expect(failure).toBeInstanceOf(StageSessionError);
	expect(failure).toMatchObject({
		costUsd: 1,
		message: new SpendCeilingReachedError({ ceilingUsd: 1, spentUsd: 1 })
			.message,
		providerCalls: [{ metrics: { costUsd: 1 } }],
	});
}

async function startsNoProductOwnerCall(): Promise<void> {
	const chargedCallCostUsd = 1;

	const expectedCalls = 0;

	const spendCeiling = createSpendCeiling({ ceilingUsd: 1 });
	spendCeiling.charge(chargedCallCostUsd);
	let calls = 0;
	const productOwner = productOwnerFor(spendCeiling, async () => {
		calls += CALL_COUNT_INCREMENT;
		return await Promise.resolve(answer(INITIAL_PRODUCT_OWNER_REPLY_COST_USD));
	});

	const failure = await failureOf(productOwner.ask("shape", "Which scope?"));

	expect(failure).toBeInstanceOf(SpendCeilingReachedError);
	expect(calls).toBe(expectedCalls);
}

describe("the spend ceiling", () => {
	describe("when the spend has reached the ceiling", () => {
		it("starts no worker turn", startsNoWorkerTurn);
		it(
			"carries the session's calls out of a refused later turn",
			carriesTheSessionSCallsOutOfARefusedLaterTurn,
		);
		it("starts no Product Owner call", startsNoProductOwnerCall);
	});
});
