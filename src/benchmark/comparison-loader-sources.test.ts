import { describe, expect, it } from "bun:test";

import { digest } from "./comparison-evidence-record-test-fixtures";
import { loadComparisonEvidence } from "./comparison-loader";
import comparisonLoaderTestFixture from "./comparison-loader-test-fixture";

const FIRST_COMPARISON_CASE_INDEX = 0;

const FIRST_CONFIRMATION_REP_INDEX = 0;

const SECOND_CONFIRMATION_REP_INDEX = 1;

describe(loadComparisonEvidence.name, () => {
	const { fixture } = comparisonLoaderTestFixture();

	it("loads and hashes source groups, reps, and executed corpus", async () => {
		const evidence = await loadComparisonEvidence(fixture.manifestFile);
		const candidate = evidence.cases.at(FIRST_COMPARISON_CASE_INDEX)?.arms
			.candidate;

		expect(evidence.contract).toEqual({
			declaredStages: ["build"],
			mode: "stage",
			reps: 2,
		});
		expect(evidence.manifest.sha256).toMatch(/^[0-9a-f]{64}$/u);
		expect({
			groupPath: candidate?.group.path,
			role: candidate?.role,
		}).toEqual({
			groupPath: "groups/case-1-candidate/group.json",
			role: "candidate",
		});
		expect(candidate?.group.sha256).toMatch(/^[0-9a-f]{64}$/u);
		expect(candidate?.reps.map(({ path }) => path)).toEqual([
			"groups/case-1-candidate/reps/case-1-candidate-rep-1/rep.json",
			"groups/case-1-candidate/reps/case-1-candidate-rep-2/rep.json",
		]);
		expect(candidate?.reps.at(FIRST_CONFIRMATION_REP_INDEX)?.sha256).toMatch(
			/^[0-9a-f]{64}$/u,
		);
		expect(candidate?.reps.at(SECOND_CONFIRMATION_REP_INDEX)?.sha256).toMatch(
			/^[0-9a-f]{64}$/u,
		);
		expect(candidate?.executedCorpus).toEqual([
			{
				kind: "corpus",
				path: "inputs/corpus/build/SKILL.md",
				sha256: digest("candidate corpus\n"),
			},
		]);
	});
});
