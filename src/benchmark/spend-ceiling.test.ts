import { describe, expect, it } from "bun:test";

import type { ClaudeCallMetrics } from "./contracts";
import {
	SpendCeilingReachedError,
	createSpendCeiling,
	repSpendCeilings,
} from "./spend-ceiling";

const GROUP_EXHAUSTING_FIRST_CALL_USD = 1.2;
const GROUP_EXHAUSTING_SECOND_CALL_USD = 0.8;
const EXHAUSTED_GROUP_SESSION_BUDGET_USD = 0.3;

function callTokens(tokens: {
	readonly input: number;
	readonly cacheRead: number;
	readonly cacheWrite: number;
	readonly output: number;
}): ClaudeCallMetrics {
	return {
		cacheReadTokens: tokens.cacheRead,
		cacheWriteTokens: tokens.cacheWrite,
		costUsd: 0,
		inputTokens: tokens.input,
		outputTokens: tokens.output,
		turns: 1,
	};
}

function reachedError(action: () => number): SpendCeilingReachedError {
	try {
		action();
	} catch (error) {
		if (error instanceof SpendCeilingReachedError) {
			return error;
		}

		throw error;
	}

	throw new Error("Expected the spend ceiling to be reached");
}

const createSpendCeilingGrantsASessionItsOwnBudgetWhileTheCeilingLeftCoversIt =
	(): void => {
		const requestedStageBudgetUsd = 0.3;

		const expectedAvailableBudgetUsd = 0.3;

		const ceiling = createSpendCeiling({ ceilingUsd: 1 });

		expect(ceiling.budgetFor(requestedStageBudgetUsd)).toBe(
			expectedAvailableBudgetUsd,
		);
	};

const createSpendCeilingGrantsASessionNoMoreThanTheCeilingLeftAfterTheSpendSoFar =
	(): void => {
		const chargedCallCostUsd = 0.6;
		const requestedStageBudgetUsd = 0.9;

		const expectedAvailableBudgetUsd = 0.4;

		const ceiling = createSpendCeiling({ ceilingUsd: 1 });
		ceiling.charge(chargedCallCostUsd);

		expect(ceiling.budgetFor(requestedStageBudgetUsd)).toBeCloseTo(
			expectedAvailableBudgetUsd,
		);
	};

const createSpendCeilingReportsTheSpendChargedSoFar = (): void => {
	const firstChargedCallCostUsd = 0.25;
	const secondChargedCallCostUsd = 0.5;

	const expectedSpentUsd = 0.75;

	const ceiling = createSpendCeiling({ ceilingUsd: 1 });

	ceiling.charge(firstChargedCallCostUsd);
	ceiling.charge(secondChargedCallCostUsd);

	expect(ceiling.spentUsd()).toBe(expectedSpentUsd);
};

const createSpendCeilingTalliesTheTokensOfTheCallsItIsChargedForCacheReadsAndWritesCounted =
	(): void => {
		const firstChargedCallCostUsd = 0.25;
		const secondChargedCallCostUsd = 0.5;
		const thirdChargedCallCostUsd = 0.1;

		const ceiling = createSpendCeiling({ ceilingUsd: 1 });

		ceiling.charge(
			firstChargedCallCostUsd,
			callTokens({ cacheRead: 20, cacheWrite: 3, input: 100, output: 40 }),
		);
		ceiling.charge(
			secondChargedCallCostUsd,
			callTokens({ cacheRead: 0, cacheWrite: 0, input: 10, output: 5 }),
		);
		ceiling.charge(thirdChargedCallCostUsd);

		expect(ceiling.tokens()).toEqual({ input: 133, output: 45 });
	};

const createSpendCeilingWhenTheSpendHasReachedTheCeilingRefusesToStartASessionNamingTheCeiling =
	(): void => {
		const chargedCallCostUsd = 0.6;
		const requestedStageBudgetUsd = 0.3;

		const expectedCeilingUsd = 1;
		const expectedSpentUsd = 1.2;

		const ceiling = createSpendCeiling({ ceilingUsd: 1 });
		ceiling.charge(chargedCallCostUsd);
		ceiling.charge(chargedCallCostUsd);

		const error = reachedError(() =>
			ceiling.budgetFor(requestedStageBudgetUsd),
		);

		expect(error.ceilingUsd).toBe(expectedCeilingUsd);
		expect(error.spentUsd).toBe(expectedSpentUsd);
	};

const createSpendCeilingWhenItIsOneRepWithinAGroupGrantsNoMoreThanTheGroupCeiling =
	(): void => {
		const firstChargedCallCostUsd = 0.6;
		const secondChargedCallCostUsd = 1.2;
		const requestedStageBudgetUsd = 1;

		const expectedAvailableBudgetUsd = 0.2;

		const group = createSpendCeiling({ ceilingUsd: 2 });
		const first = createSpendCeiling({ ceilingUsd: 1, within: group });
		const second = createSpendCeiling({ ceilingUsd: 1, within: group });
		first.charge(firstChargedCallCostUsd);
		second.charge(secondChargedCallCostUsd);

		expect(first.budgetFor(requestedStageBudgetUsd)).toBeCloseTo(
			expectedAvailableBudgetUsd,
		);
	};

const createSpendCeilingWhenItIsOneRepWithinAGroupRefusesEveryRepOnceTheGroupsSpend =
	(): void => {
		const expectedCeilingUsd = 2;
		const expectedSpentUsd = 2;

		const group = createSpendCeiling({ ceilingUsd: 2 });
		const first = createSpendCeiling({ ceilingUsd: 1.5, within: group });
		const second = createSpendCeiling({ ceilingUsd: 1.5, within: group });
		first.charge(GROUP_EXHAUSTING_FIRST_CALL_USD);
		second.charge(GROUP_EXHAUSTING_SECOND_CALL_USD);

		const error = reachedError(() =>
			first.budgetFor(EXHAUSTED_GROUP_SESSION_BUDGET_USD),
		);

		expect(error.ceilingUsd).toBe(expectedCeilingUsd);
		expect(error.spentUsd).toBe(expectedSpentUsd);
	};

const createSpendCeilingWhenItIsOneRepWithinAGroupRefusesARepThatReachedItsOwn =
	(): void => {
		const chargedCallCostUsd = 1;
		const requestedStageBudgetUsd = 0.3;

		const expectedCeilingUsd = 1;

		const group = createSpendCeiling({ ceilingUsd: 3 });
		const rep = createSpendCeiling({ ceilingUsd: 1, within: group });
		rep.charge(chargedCallCostUsd);

		const error = reachedError(() => rep.budgetFor(requestedStageBudgetUsd));

		expect(error.ceilingUsd).toBe(expectedCeilingUsd);
	};

describe(createSpendCeiling.name, () => {
	it(
		"grants a session its own budget while the ceiling left covers it",
		createSpendCeilingGrantsASessionItsOwnBudgetWhileTheCeilingLeftCoversIt,
	);

	it(
		"grants a session no more than the ceiling left after the spend so far",
		createSpendCeilingGrantsASessionNoMoreThanTheCeilingLeftAfterTheSpendSoFar,
	);

	it(
		"reports the spend charged so far",
		createSpendCeilingReportsTheSpendChargedSoFar,
	);

	it(
		"tallies the tokens of the calls it is charged for, cache reads and writes counted in",
		createSpendCeilingTalliesTheTokensOfTheCallsItIsChargedForCacheReadsAndWritesCounted,
	);

	describe("when the spend has reached the ceiling", () => {
		it(
			"refuses to start a session, naming the ceiling and the spend",
			createSpendCeilingWhenTheSpendHasReachedTheCeilingRefusesToStartASessionNamingTheCeiling,
		);
	});

	describe("when it is one rep within a group", () => {
		it(
			"grants no more than the group ceiling left",
			createSpendCeilingWhenItIsOneRepWithinAGroupGrantsNoMoreThanTheGroupCeiling,
		);

		it(
			"refuses every rep once the group's spend reaches the group ceiling",
			createSpendCeilingWhenItIsOneRepWithinAGroupRefusesEveryRepOnceTheGroupsSpend,
		);

		it(
			"refuses a rep that reached its own ceiling while the group has some left",
			createSpendCeilingWhenItIsOneRepWithinAGroupRefusesARepThatReachedItsOwn,
		);
	});
});

const repSpendCeilingsHoldsEveryRepToTheCeiling = (): void => {
	const requestedStageBudgetUsd = 5;

	const expectedAvailableBudgetUsd = 1;

	const repCeiling = repSpendCeilings({ reps: 3, spendCeilingUsd: 1 });
	const rep = repCeiling();

	expect(rep.budgetFor(requestedStageBudgetUsd)).toBe(
		expectedAvailableBudgetUsd,
	);
};

const repSpendCeilingsHoldsTheRepsTogetherToTheRepsTimesTheCeiling =
	(): void => {
		const firstChargedCallCostUsd = 1.5;
		const secondChargedCallCostUsd = 0.4;
		const requestedStageBudgetUsd = 5;

		const expectedAvailableBudgetUsd = 0.1;

		const repCeiling = repSpendCeilings({ reps: 2, spendCeilingUsd: 1 });
		const overrun = repCeiling();
		const other = repCeiling();
		overrun.charge(firstChargedCallCostUsd);
		other.charge(secondChargedCallCostUsd);

		expect(other.budgetFor(requestedStageBudgetUsd)).toBeCloseTo(
			expectedAvailableBudgetUsd,
		);
	};

describe(repSpendCeilings.name, () => {
	it(
		"holds every rep to the ceiling",
		repSpendCeilingsHoldsEveryRepToTheCeiling,
	);

	it(
		"holds the reps together to the reps times the ceiling",
		repSpendCeilingsHoldsTheRepsTogetherToTheRepsTimesTheCeiling,
	);
});
