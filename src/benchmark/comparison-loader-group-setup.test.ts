import { describe, expect, it } from "bun:test";

import { loadComparisonEvidence } from "./comparison-loader";
import comparisonLoaderTestFixture from "./comparison-loader-test-fixture";

describe(loadComparisonEvidence.name, () => {
	const { fixture } = comparisonLoaderTestFixture();
	describe("when an arm names a group run under another setup than its first", () => {
		it("refuses the group, naming the setup", async () => {
			const groupId = await fixture.addGroup("case-1", "candidate");
			await fixture.changeGroup(groupId, (group) => ({
				...group,
				inputs: { ...group.inputs, setup: "actual" as const },
			}));

			expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
				"case case-1 arm candidate group groups/case-1-candidate-more/group.json field setup differs from group groups/case-1-candidate/group.json",
			);
		});
	});
});
