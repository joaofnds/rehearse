import { describe, expect, it } from "bun:test";

import { changePipelineTarget } from "./comparison-frozen-evidence-test-fixtures";
import { loadComparisonEvidence } from "./comparison-loader";
import comparisonLoaderTestFixture from "./comparison-loader-test-fixture";
import usePipelineCheckpoints from "./comparison-pipeline-evidence-test-fixtures";

describe(loadComparisonEvidence.name, () => {
	const { fixture } = comparisonLoaderTestFixture();

	it("normalizes only pipeline checkpoint identities derived from each corpus", async () => {
		await usePipelineCheckpoints(fixture);

		const evidence = await loadComparisonEvidence(fixture.manifestFile);

		expect(evidence.contract.mode).toBe("pipeline");
	});

	it("rejects changed workflow state inside a pipeline checkpoint record", async () => {
		await usePipelineCheckpoints(fixture, "candidate");

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"case case-1 arms baseline and candidate field inputs.files.checkpoint:inputs/checkpoint/checkpoint.json",
		);
	});

	it("rejects arms whose frozen target configurations differ", async () => {
		await changePipelineTarget(fixture, "case-1", "candidate");

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"case case-1 arms baseline and candidate field inputs.files.pipeline:inputs/pipeline.json",
		);
	});
});
