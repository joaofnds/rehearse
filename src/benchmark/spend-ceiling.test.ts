import { describe, expect, it } from "bun:test";
import type { ClaudeCallMetrics } from "./contracts";
import {
	createSpendCeiling,
	repSpendCeilings,
	SpendCeilingReachedError,
} from "./spend-ceiling";

function callTokens(tokens: {
	readonly input: number;
	readonly cacheRead: number;
	readonly cacheWrite: number;
	readonly output: number;
}): ClaudeCallMetrics {
	return {
		costUsd: 0,
		inputTokens: tokens.input,
		cacheReadTokens: tokens.cacheRead,
		cacheWriteTokens: tokens.cacheWrite,
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

describe(createSpendCeiling.name, () => {
	it("grants a session its own budget while the ceiling left covers it", () => {
		const ceiling = createSpendCeiling({ ceilingUsd: 1 });

		expect(ceiling.budgetFor(0.3)).toBe(0.3);
	});

	it("grants a session no more than the ceiling left after the spend so far", () => {
		const ceiling = createSpendCeiling({ ceilingUsd: 1 });
		ceiling.charge(0.6);

		expect(ceiling.budgetFor(0.9)).toBeCloseTo(0.4);
	});

	it("reports the spend charged so far", () => {
		const ceiling = createSpendCeiling({ ceilingUsd: 1 });

		ceiling.charge(0.25);
		ceiling.charge(0.5);

		expect(ceiling.spentUsd()).toBe(0.75);
	});

	it("tallies the tokens of the calls it is charged for, cache reads and writes counted in", () => {
		const ceiling = createSpendCeiling({ ceilingUsd: 1 });

		ceiling.charge(
			0.25,
			callTokens({ input: 100, cacheRead: 20, cacheWrite: 3, output: 40 }),
		);
		ceiling.charge(
			0.5,
			callTokens({ input: 10, cacheRead: 0, cacheWrite: 0, output: 5 }),
		);
		ceiling.charge(0.1);

		expect(ceiling.tokens()).toEqual({ input: 133, output: 45 });
	});

	describe("when the spend has reached the ceiling", () => {
		it("refuses to start a session, naming the ceiling and the spend", () => {
			const ceiling = createSpendCeiling({ ceilingUsd: 1 });
			ceiling.charge(0.6);
			ceiling.charge(0.6);

			const error = reachedError(() => ceiling.budgetFor(0.3));

			expect(error.ceilingUsd).toBe(1);
			expect(error.spentUsd).toBe(1.2);
		});
	});

	describe("when it is one rep within a group", () => {
		it("grants no more than the group ceiling left", () => {
			const group = createSpendCeiling({ ceilingUsd: 2 });
			const first = createSpendCeiling({ ceilingUsd: 1, within: group });
			const second = createSpendCeiling({ ceilingUsd: 1, within: group });
			first.charge(0.6);
			second.charge(1.2);

			expect(first.budgetFor(1)).toBeCloseTo(0.2);
		});

		it("refuses every rep once the group's spend reaches the group ceiling", () => {
			const group = createSpendCeiling({ ceilingUsd: 2 });
			const first = createSpendCeiling({ ceilingUsd: 1.5, within: group });
			const second = createSpendCeiling({ ceilingUsd: 1.5, within: group });
			first.charge(1.2);
			second.charge(0.8);

			const error = reachedError(() => first.budgetFor(0.3));

			expect(error.ceilingUsd).toBe(2);
			expect(error.spentUsd).toBe(2);
		});

		it("refuses a rep that reached its own ceiling while the group has some left", () => {
			const group = createSpendCeiling({ ceilingUsd: 3 });
			const rep = createSpendCeiling({ ceilingUsd: 1, within: group });
			rep.charge(1);

			const error = reachedError(() => rep.budgetFor(0.3));

			expect(error.ceilingUsd).toBe(1);
		});
	});
});

describe(repSpendCeilings.name, () => {
	it("holds every rep to the ceiling", () => {
		const repCeiling = repSpendCeilings({ spendCeilingUsd: 1, reps: 3 });
		const rep = repCeiling();

		expect(rep.budgetFor(5)).toBe(1);
	});

	it("holds the reps together to the reps times the ceiling", () => {
		const repCeiling = repSpendCeilings({ spendCeilingUsd: 1, reps: 2 });
		const overrun = repCeiling();
		const other = repCeiling();
		overrun.charge(1.5);
		other.charge(0.4);

		expect(other.budgetFor(5)).toBeCloseTo(0.1);
	});
});
