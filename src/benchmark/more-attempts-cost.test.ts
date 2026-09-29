import { describe, expect, it } from "bun:test";
import type { ArmResources } from "./more-attempts-cost";
import { moreAttemptsCost } from "./more-attempts-cost";

function costing(perAttemptUsd: number): ArmResources {
	return { status: "AVAILABLE", total: { costUsd: { mean: perAttemptUsd } } };
}

describe(moreAttemptsCost.name, () => {
	it("costs each added attempt at its arm's recorded cost per attempt", () => {
		const cost = moreAttemptsCost(
			{
				baseline: costing(1.5),
				candidate: costing(3),
				control: costing(0.5),
			},
			2,
		);

		expect(cost).toEqual({ state: "available", attemptsPerArm: 2, usd: 10 });
	});

	describe("when an arm recorded no cost for an attempt", () => {
		it("states no cost and names each attempt that lacks one", () => {
			const cost = moreAttemptsCost(
				{
					baseline: costing(1.5),
					candidate: {
						status: "UNAVAILABLE",
						missingEvidence: [{ repId: "rep-2", missing: ["worker cost"] }],
					},
					control: costing(1),
				},
				2,
			);

			expect(cost).toEqual({
				state: "unavailable",
				reasons: ["rep-2 lacks worker cost"],
			});
		});
	});
});
