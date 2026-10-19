import { describe, expect, it } from "bun:test";

import extendEveryComparisonArm from "./comparison-additional-groups-fixture";
import { loadComparisonEvidence } from "./comparison-loader";
import comparisonLoaderTestFixture from "./comparison-loader-test-fixture";

const FIRST_COMPARISON_CASE_INDEX = 0;

describe(loadComparisonEvidence.name, () => {
	const { fixture } = comparisonLoaderTestFixture();

	it("reads together the reps of every group an arm names, in the order named", async () => {
		const expectedReps = 4;

		await extendEveryComparisonArm(fixture);

		const evidence = await loadComparisonEvidence(fixture.manifestFile);
		const candidate = evidence.cases.at(FIRST_COMPARISON_CASE_INDEX)?.arms
			.candidate;

		expect(evidence.contract.reps).toBe(expectedReps);
		expect(candidate?.groups.map(({ path }) => path)).toEqual([
			"groups/case-1-candidate/group.json",
			"groups/case-1-candidate-more/group.json",
		]);
		expect(candidate?.reps.map(({ path }) => path)).toEqual([
			"groups/case-1-candidate/reps/case-1-candidate-rep-1/rep.json",
			"groups/case-1-candidate/reps/case-1-candidate-rep-2/rep.json",
			"groups/case-1-candidate-more/reps/case-1-candidate-more-rep-1/rep.json",
			"groups/case-1-candidate-more/reps/case-1-candidate-more-rep-2/rep.json",
		]);
	});
});
