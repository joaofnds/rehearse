import { describe, expect, it } from "bun:test";

import { failureOf } from "#cli/cli-test-support";

import { runJudge } from "./judge";
import {
	QUOTE,
	RUBRIC_IDS,
	completeGrade,
	gradeWith,
	requirement,
	response,
	withFirstRequirement,
} from "./judge-test-fixtures";
import { SpendCeilingReachedError, createSpendCeiling } from "./spend-ceiling";
import { budgetHaltEnvelope } from "./test-support";

const FIRST_RUBRIC_ID_INDEX = 0;

const HALTED_INPUT_TOKENS = 10;

const HALTED_CACHE_READ_TOKENS = 200_701;

const HALTED_CACHE_WRITE_TOKENS = 7727;

const CALL_COUNT_INCREMENT = 1;

async function clampsAttemptBudgetsToRemainingCeiling(): Promise<void> {
	const expectedObservedSecondBudget = 0.15;

	const expectedBudgets = 0.25;

	const invalidGrade = withFirstRequirement(completeGrade("PASS"), {
		...requirement(RUBRIC_IDS[FIRST_RUBRIC_ID_INDEX], "PASS"),
		evidence: [],
	});
	const responses = [response(invalidGrade), response(completeGrade("PASS"))];
	const budgets: number[] = [];

	await gradeWith(
		async (_prompt, budgetUsd) => {
			budgets.push(budgetUsd);
			return await Promise.resolve(responses.shift() ?? "");
		},
		[],
		createSpendCeiling({ ceilingUsd: 0.25 }),
	);

	const [observedFirstBudget, observedSecondBudget] = budgets;

	expect(observedFirstBudget).toBeCloseTo(expectedBudgets);
	expect(observedSecondBudget).toBeCloseTo(expectedObservedSecondBudget);
}

async function chargesEachAttemptCost(): Promise<void> {
	const expectedSpentUsd = 0.1;

	const spendCeiling = createSpendCeiling({ ceilingUsd: 10 });

	await gradeWith(
		async () => await Promise.resolve(response(completeGrade("PASS"))),
		[],
		spendCeiling,
	);

	expect(spendCeiling.spentUsd()).toBeCloseTo(expectedSpentUsd);
}

async function talliesTokensAcrossAttempts(): Promise<void> {
	const spendCeiling = createSpendCeiling({ ceilingUsd: 10 });
	const validGrade = completeGrade("PASS");
	const rejectedGrade = withFirstRequirement(validGrade, {
		...requirement(RUBRIC_IDS[FIRST_RUBRIC_ID_INDEX], "PASS"),
		evidence: [
			{
				claim: "unavailable evidence",
				path: "src/missing.ts",
				quote: QUOTE,
				source: "diff",
			},
		],
	});
	const responses = [rejectedGrade, validGrade].map((grade) =>
		JSON.stringify({
			num_turns: 1,
			session_id: "judge-session",
			structured_output: grade,
			total_cost_usd: 0.1,
			usage: {
				cache_creation_input_tokens: 13,
				cache_read_input_tokens: 20,
				input_tokens: 100,
				output_tokens: 45,
			},
		}),
	);

	await gradeWith(
		async () => await Promise.resolve(responses.shift() ?? ""),
		[],
		spendCeiling,
	);

	expect(spendCeiling.tokens()).toEqual({ input: 266, output: 90 });
}

async function chargesFailedAttemptCost(): Promise<void> {
	const expectedSpentUsd = 0.4;

	const spendCeiling = createSpendCeiling({ ceilingUsd: 1 });

	await failureOf(
		gradeWith(
			async () =>
				await Promise.resolve(
					JSON.stringify({
						is_error: true,
						session_id: "judge-session",
						subtype: "error_max_budget_usd",
						terminal_reason: "budget_exhausted",
						total_cost_usd: 0.4,
						type: "result",
					}),
				),
			[],
			spendCeiling,
		),
	);

	expect(spendCeiling.spentUsd()).toBeCloseTo(expectedSpentUsd);
}

async function retainsHaltedMetricsAndTalliesTokens(): Promise<void> {
	const spendCeiling = createSpendCeiling({ ceilingUsd: 1 });

	const failure = await failureOf(
		gradeWith(async () => await budgetHaltEnvelope(), [], spendCeiling),
	);

	expect(failure).toMatchObject({
		providerCalls: [{ metrics: { costUsd: 0.5782854, outputTokens: 3105 } }],
	});
	expect(spendCeiling.tokens()).toEqual({
		input:
			HALTED_INPUT_TOKENS +
			HALTED_CACHE_READ_TOKENS +
			HALTED_CACHE_WRITE_TOKENS,
		output: 3105,
	});
}

async function startsNoAttemptAtSpentCeiling(): Promise<void> {
	const chargedCallCostUsd = 1;

	const expectedCalls = 0;

	const spendCeiling = createSpendCeiling({ ceilingUsd: 1 });
	spendCeiling.charge(chargedCallCostUsd);
	let calls = 0;

	const failure = await failureOf(
		gradeWith(
			async () => {
				calls += CALL_COUNT_INCREMENT;
				return await Promise.resolve(response(completeGrade("PASS")));
			},
			[],
			spendCeiling,
		),
	);

	expect(failure).toBeInstanceOf(SpendCeilingReachedError);
	expect(calls).toBe(expectedCalls);
}

describe(runJudge.name, () => {
	describe("under a spend ceiling", () => {
		it(
			"starts each attempt with no more budget than the ceiling left",
			clampsAttemptBudgetsToRemainingCeiling,
		);

		it("charges the ceiling every attempt's cost", chargesEachAttemptCost);

		it(
			"tallies on the ceiling the tokens every attempt used",
			talliesTokensAcrossAttempts,
		);

		it(
			"charges the ceiling an attempt that ends in an error",
			chargesFailedAttemptCost,
		);

		it(
			"keeps a halted attempt's metrics and tallies its tokens on the ceiling",
			retainsHaltedMetricsAndTalliesTokens,
		);

		it(
			"starts no attempt once the spend has reached the ceiling",
			startsNoAttemptAtSpentCeiling,
		);
	});
});
