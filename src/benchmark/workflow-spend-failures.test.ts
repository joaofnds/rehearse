import { describe, expect, it } from "bun:test";

import { failureOf } from "#cli/cli-test-support";

import { runJsonSession, runStreamedSession } from "./claude";
import markTestProcessConfined from "./confined-session-test-fixture";
import { createSpendCeiling } from "./spend-ceiling";
import StageSessionError from "./stage-session-error";
import { budgetHaltEnvelope, haltingCommand } from "./test-support";
import { WorkflowExecutionError, runWorkflowStage } from "./workflow";
import {
	budgetHalt,
	productOwnerFor,
	questionTurn,
	testResources,
	workflowStageRequest,
} from "./workflow-test-fixtures";

testResources.registerCleanup();
markTestProcessConfined();

const INITIAL_WORKER_TURN_NUMBER = 1;
const HALTED_SESSION_COST_USD = 0.5782854;
const QUESTION_TURN_COST_USD = 0.203;
const HALTED_INPUT_TOKENS = 10;
const HALTED_CACHE_READ_TOKENS = 200_701;
const HALTED_CACHE_WRITE_TOKENS = 7727;

const WORKFLOW_TURN_INCREMENT = 1;

async function chargesTheCeilingTheWorkerTurnSReportedCost(): Promise<void> {
	const expectedSpentUsd = 0.4;

	const spendCeiling = createSpendCeiling({ ceilingUsd: 1 });

	await failureOf(
		runWorkflowStage(
			workflowStageRequest({ spendCeiling }),
			async () => await Promise.resolve(budgetHalt({ costUsd: 0.4 })),
		),
	);

	expect(spendCeiling.spentUsd()).toBeCloseTo(expectedSpentUsd);
}

async function chargesTheCeilingAResumedWorkerTurnTheCLIHaltedWithAFailedExit(): Promise<void> {
	const expectedSpentUsd = 0.5782854;

	const spendCeiling = createSpendCeiling({ ceilingUsd: 1 });
	const question = JSON.stringify({
		session_id: "worker-session",
		structured_output: { message: "Which scope?", status: "QUESTION" },
		total_cost_usd: 0.203,
		type: "result",
	});
	const halt = haltingCommand(await budgetHaltEnvelope());
	let turn = 0;

	await failureOf(
		runWorkflowStage(workflowStageRequest({ spendCeiling }), async () => {
			turn += WORKFLOW_TURN_INCREMENT;
			return await (turn === INITIAL_WORKER_TURN_NUMBER
				? Promise.resolve(question)
				: runStreamedSession(halt, process.cwd()));
		}),
	);

	expect(spendCeiling.spentUsd()).toBeCloseTo(expectedSpentUsd);
}

async function keepsAHaltedWorkerTurnSOwnSpendAmongTheSessionSCalls(): Promise<void> {
	const question = JSON.stringify({
		session_id: "worker-session",
		structured_output: { message: "Which scope?", status: "QUESTION" },
		total_cost_usd: 0.203,
		type: "result",
	});
	const halt = haltingCommand(await budgetHaltEnvelope());
	let turn = 0;

	const workflowRequest = workflowStageRequest({
		spendCeiling: createSpendCeiling({ ceilingUsd: 1 }),
	});
	const failure = await failureOf(
		runWorkflowStage(workflowRequest, async () => {
			turn += WORKFLOW_TURN_INCREMENT;
			return await (turn === INITIAL_WORKER_TURN_NUMBER
				? Promise.resolve(question)
				: runStreamedSession(halt, process.cwd()));
		}),
	);

	expect(failure).toBeInstanceOf(WorkflowExecutionError);
	expect(failure).toMatchObject({
		costUsd: 0.5782854,
		providerCalls: [
			{},
			{
				metrics: {
					costUsd: HALTED_SESSION_COST_USD - QUESTION_TURN_COST_USD,
					outputTokens: 3105,
				},
			},
		],
	});
}

async function countsAHaltedWorkerTurnSTokensAgainstTheRun(): Promise<void> {
	const spendCeiling = createSpendCeiling({ ceilingUsd: 1 });
	const halt = haltingCommand(await budgetHaltEnvelope());

	await failureOf(
		runWorkflowStage(
			workflowStageRequest({ spendCeiling }),
			async () => await runStreamedSession(halt, process.cwd()),
		),
	);

	expect(spendCeiling.tokens()).toEqual({
		input:
			HALTED_INPUT_TOKENS +
			HALTED_CACHE_READ_TOKENS +
			HALTED_CACHE_WRITE_TOKENS,
		output: 3105,
	});
}

async function keepsAHaltedProductOwnerCallInItsSnapshot(): Promise<void> {
	const halt = haltingCommand(await budgetHaltEnvelope());
	const productOwner = productOwnerFor(
		createSpendCeiling({ ceilingUsd: 1 }),
		async () => await runJsonSession(halt, process.cwd()),
	);

	await failureOf(productOwner.ask("shape", "Which scope?"));

	expect(productOwner.snapshot()).toMatchObject({
		providerCalls: [{ metrics: { costUsd: 0.5782854, outputTokens: 3105 } }],
		spentUsd: 0.5782854,
	});
}

async function carriesTheSessionSCallsOutOfAHaltedProductOwnerCall(): Promise<void> {
	const spendCeiling = createSpendCeiling({ ceilingUsd: 1 });
	const productOwner = productOwnerFor(
		spendCeiling,
		async () => await Promise.resolve(budgetHalt({ costUsd: 0.25 })),
	);

	const failure = await failureOf(
		runWorkflowStage(
			{ ...workflowStageRequest({ spendCeiling }), productOwner },
			async () => await Promise.resolve(questionTurn({ totalCostUsd: 0.203 })),
		),
	);

	expect(failure).toBeInstanceOf(StageSessionError);
	expect(failure).toMatchObject({
		costUsd: 0.203,
		message: "Claude session failed",
		providerCalls: [{ metrics: { costUsd: 0.203 } }],
	});
}

async function leavesTheSessionSCostUnknownWhenItsLastTurnReportedNone(): Promise<void> {
	const spendCeiling = createSpendCeiling({ ceilingUsd: 1 });
	const productOwner = productOwnerFor(
		spendCeiling,
		async () => await Promise.resolve(budgetHalt({ costUsd: 0.25 })),
	);

	const failure = await failureOf(
		runWorkflowStage(
			{ ...workflowStageRequest({ spendCeiling }), productOwner },
			async () => await Promise.resolve(questionTurn({})),
		),
	);

	expect(failure).toMatchObject({
		costUsd: undefined,
		providerCalls: [{}],
	});
}

async function chargesTheCeilingAWorkerTurnWhoseAnswerIsNotATurn(): Promise<void> {
	const expectedSpentUsd = 0.3;

	const spendCeiling = createSpendCeiling({ ceilingUsd: 1 });

	await failureOf(
		runWorkflowStage(
			workflowStageRequest({ spendCeiling }),
			async () =>
				await Promise.resolve(
					JSON.stringify({
						session_id: "worker-session",
						structured_output: { status: "UNKNOWN" },
						total_cost_usd: 0.3,
						type: "result",
					}),
				),
		),
	);

	expect(spendCeiling.spentUsd()).toBeCloseTo(expectedSpentUsd);
}

async function chargesTheCeilingTheProductOwnerCallSReportedCost(): Promise<void> {
	const expectedSpentUsd = 0.25;

	const spendCeiling = createSpendCeiling({ ceilingUsd: 1 });
	const productOwner = productOwnerFor(
		spendCeiling,
		async () => await Promise.resolve(budgetHalt({ costUsd: 0.25 })),
	);

	await failureOf(productOwner.ask("shape", "Which scope?"));

	expect(spendCeiling.spentUsd()).toBeCloseTo(expectedSpentUsd);
}

async function chargesTheCeilingAProductOwnerCallTheCLIHaltedWithAFailedExit(): Promise<void> {
	const expectedSpentUsd = 0.5782854;

	const spendCeiling = createSpendCeiling({ ceilingUsd: 1 });
	const halt = haltingCommand(await budgetHaltEnvelope());
	const productOwner = productOwnerFor(
		spendCeiling,
		async () => await runJsonSession(halt, process.cwd()),
	);

	await failureOf(productOwner.ask("shape", "Which scope?"));

	expect(spendCeiling.spentUsd()).toBeCloseTo(expectedSpentUsd);
}

describe("the spend ceiling", () => {
	describe("when a paid call ends in an error", () => {
		it(
			"charges the ceiling the worker turn's reported cost",
			chargesTheCeilingTheWorkerTurnSReportedCost,
		);
		it(
			"charges the ceiling a resumed worker turn the CLI halted with a failed exit",
			chargesTheCeilingAResumedWorkerTurnTheCLIHaltedWithAFailedExit,
		);
		it(
			"keeps a halted worker turn's own spend among the session's calls",
			keepsAHaltedWorkerTurnSOwnSpendAmongTheSessionSCalls,
		);
		it(
			"counts a halted worker turn's tokens against the run",
			countsAHaltedWorkerTurnSTokensAgainstTheRun,
		);
		it(
			"keeps a halted Product Owner call in its snapshot",
			keepsAHaltedProductOwnerCallInItsSnapshot,
		);
		it(
			"carries the session's calls out of a halted Product Owner call",
			carriesTheSessionSCallsOutOfAHaltedProductOwnerCall,
		);
		it(
			"leaves the session's cost unknown when its last turn reported none",
			leavesTheSessionSCostUnknownWhenItsLastTurnReportedNone,
		);
		it(
			"charges the ceiling a worker turn whose answer is not a turn",
			chargesTheCeilingAWorkerTurnWhoseAnswerIsNotATurn,
		);
		it(
			"charges the ceiling the Product Owner call's reported cost",
			chargesTheCeilingTheProductOwnerCallSReportedCost,
		);
		it(
			"charges the ceiling a Product Owner call the CLI halted with a failed exit",
			chargesTheCeilingAProductOwnerCallTheCLIHaltedWithAFailedExit,
		);
	});
});
