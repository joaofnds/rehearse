import { describe, expect, it } from "bun:test";

import { projectConfirmationCost } from "./confirmation";

const ATTEMPT_CEILING_USD = 2;

describe(projectConfirmationCost.name, () => {
	it("includes a session Judge and its retry in the projected budget", () => {
		const projection = projectConfirmationCost({
			judgeBudgetUsd: 0.5,
			mode: "session",
			reps: 2,
			sessionBudgetUsd: 1,
			spendCeilingUsd: 10,
		});

		expect(projection).toEqual({
			perRepMaximumUsd: 2,
			preflightMaximumUsd: 0.1,
			reps: 2,
			totalMaximumUsd: 4.1,
		});
	});

	it("clamps the combined worker and Judge projection to the attempt ceiling", () => {
		const projection = projectConfirmationCost({
			judgeBudgetUsd: 1,
			mode: "session",
			reps: 2,
			sessionBudgetUsd: 1,
			spendCeilingUsd: 2,
		});

		expect(projection.perRepMaximumUsd).toBe(ATTEMPT_CEILING_USD);
	});
});
