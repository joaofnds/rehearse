import { describe, expect, it } from "bun:test";

import type { ArmResources } from "./more-attempts-cost";
import { moreAttemptsCost } from "./more-attempts-cost";

const ADDITIONAL_ATTEMPTS_PER_ARM = 2;

interface CostingFixtureInput {
	readonly perAttemptUsd: number;
}

function costing({ perAttemptUsd }: CostingFixtureInput): ArmResources {
	return { status: "AVAILABLE", total: { costUsd: { mean: perAttemptUsd } } };
}

describe(moreAttemptsCost.name, () => {
	it("costs each added attempt at its arm's recorded cost per attempt", () => {
		const cost = moreAttemptsCost(
			{
				baseline: costing({ perAttemptUsd: 1.5 }),
				candidate: costing({ perAttemptUsd: 3 }),
				control: costing({ perAttemptUsd: 0.5 }),
			},
			ADDITIONAL_ATTEMPTS_PER_ARM,
		);

		expect(cost).toEqual({ attemptsPerArm: 2, state: "available", usd: 10 });
	});

	describe("when an arm recorded no cost for an attempt", () => {
		it("states no cost and names each attempt that lacks one", () => {
			const cost = moreAttemptsCost(
				{
					baseline: costing({ perAttemptUsd: 1.5 }),
					candidate: {
						missingEvidence: [{ missing: ["worker cost"], repId: "rep-2" }],
						status: "UNAVAILABLE",
					},
					control: costing({ perAttemptUsd: 1 }),
				},
				ADDITIONAL_ATTEMPTS_PER_ARM,
			);

			expect(cost).toEqual({
				reasons: ["rep-2 lacks worker cost"],
				state: "unavailable",
			});
		});
	});
});
