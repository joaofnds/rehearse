import { describe, expect, it } from "bun:test";

import { createSpendCeiling } from "./spend-ceiling";
import { runWorkflowStage } from "./workflow";
import {
	CALL_USAGE,
	answer,
	budgetOf,
	productOwnerFor,
	queuedResponses,
	stageResult,
	testResources,
	workflowStageRequest,
} from "./workflow-test-fixtures";

testResources.registerCleanup();

const INITIAL_PRODUCT_OWNER_REPLY_COST_USD = 0.1;
const LATER_PRODUCT_OWNER_REPLY_COST_USD = 0.2;
const LATE_PRODUCT_OWNER_REPLY_COST_USD = 0.5;

async function startsAWorkerTurnWithNoMoreBudgetThanTheCeilingLeft(): Promise<void> {
	const chargedCallCostUsd = 0.6;

	const spendCeiling = createSpendCeiling({ ceilingUsd: 1 });
	spendCeiling.charge(chargedCallCostUsd);
	const budgets: (string | undefined)[] = [];

	await runWorkflowStage(
		workflowStageRequest({ spendCeiling }),
		async (command) => {
			budgets.push(budgetOf(command));
			return await Promise.resolve(stageResult({ totalCostUsd: 0.1 }));
		},
	);

	expect(budgets).toEqual(["0.4"]);
}

async function chargesTheCeilingWhatEachWorkerTurnAddsToTheSession(): Promise<void> {
	const expectedSpentUsd = 0.5;

	const spendCeiling = createSpendCeiling({ ceilingUsd: 10 });
	const responses = [
		JSON.stringify({
			session_id: "worker-session",
			structured_output: { message: "Which scope?", status: "QUESTION" },
			total_cost_usd: 0.3,
			type: "result",
		}),
		stageResult({ totalCostUsd: 0.5 }),
	];

	await runWorkflowStage(
		workflowStageRequest({ spendCeiling }),
		queuedResponses(responses),
	);

	expect(spendCeiling.spentUsd()).toBeCloseTo(expectedSpentUsd);
}

async function talliesOnTheCeilingTheTokensEachWorkerTurnUsed(): Promise<void> {
	const spendCeiling = createSpendCeiling({ ceilingUsd: 10 });
	const responses = [
		JSON.stringify({
			num_turns: 1,
			session_id: "worker-session",
			structured_output: { message: "Which scope?", status: "QUESTION" },
			total_cost_usd: 0.3,
			type: "result",
			usage: CALL_USAGE,
		}),
		JSON.stringify({
			num_turns: 1,
			session_id: "worker-session",
			structured_output: { message: "Shaped", status: "COMPLETE" },
			total_cost_usd: 0.5,
			type: "result",
			usage: CALL_USAGE,
		}),
	];

	await runWorkflowStage(
		workflowStageRequest({ spendCeiling }),
		queuedResponses(responses),
	);

	expect(spendCeiling.tokens()).toEqual({ input: 266, output: 90 });
}

async function talliesOnTheCeilingTheTokensEachProductOwnerCallUsed(): Promise<void> {
	const spendCeiling = createSpendCeiling({ ceilingUsd: 10 });
	const productOwner = productOwnerFor(
		spendCeiling,
		async () =>
			await Promise.resolve(
				JSON.stringify({
					num_turns: 1,
					session_id: "po-session",
					structured_output: { answer: "Use the small scope" },
					total_cost_usd: 0.2,
					usage: CALL_USAGE,
				}),
			),
	);

	await productOwner.ask("shape", "Which scope?");

	expect(spendCeiling.tokens()).toEqual({ input: 133, output: 45 });
}

async function startsAProductOwnerCallWithNoMoreBudgetThanTheCeilingLeft(): Promise<void> {
	const chargedCallCostUsd = 0.75;

	const spendCeiling = createSpendCeiling({ ceilingUsd: 1 });
	spendCeiling.charge(chargedCallCostUsd);
	const budgets: (string | undefined)[] = [];
	const productOwner = productOwnerFor(spendCeiling, async (command) => {
		budgets.push(budgetOf(command));
		return await Promise.resolve(answer(INITIAL_PRODUCT_OWNER_REPLY_COST_USD));
	});

	await productOwner.ask("shape", "Which scope?");

	expect(budgets).toEqual(["0.25"]);
}

async function chargesTheCeilingWhatEachProductOwnerCallAddsToItsSession(): Promise<void> {
	const expectedSpentUsd = 0.5;

	const spendCeiling = createSpendCeiling({ ceilingUsd: 10 });
	const responses = [
		answer(LATER_PRODUCT_OWNER_REPLY_COST_USD),
		answer(LATE_PRODUCT_OWNER_REPLY_COST_USD),
	];
	const productOwner = productOwnerFor(
		spendCeiling,
		queuedResponses(responses),
	);

	await productOwner.ask("shape", "Which scope?");
	await productOwner.ask("shape", "Any constraints?");

	expect(spendCeiling.spentUsd()).toBeCloseTo(expectedSpentUsd);
}

describe("the spend ceiling", () => {
	it(
		"starts a worker turn with no more budget than the ceiling left",
		startsAWorkerTurnWithNoMoreBudgetThanTheCeilingLeft,
	);
	it(
		"charges the ceiling what each worker turn adds to the session",
		chargesTheCeilingWhatEachWorkerTurnAddsToTheSession,
	);
	it(
		"tallies on the ceiling the tokens each worker turn used",
		talliesOnTheCeilingTheTokensEachWorkerTurnUsed,
	);
	it(
		"tallies on the ceiling the tokens each Product Owner call used",
		talliesOnTheCeilingTheTokensEachProductOwnerCallUsed,
	);
	it(
		"starts a Product Owner call with no more budget than the ceiling left",
		startsAProductOwnerCallWithNoMoreBudgetThanTheCeilingLeft,
	);
	it(
		"charges the ceiling what each Product Owner call adds to its session",
		chargesTheCeilingWhatEachProductOwnerCallAddsToItsSession,
	);
});
