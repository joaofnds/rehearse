import { describe, expect, it } from "bun:test";

import { loadComparisonEvidence } from "./comparison-loader";
import comparisonLoaderTestFixture from "./comparison-loader-test-fixture";

describe(loadComparisonEvidence.name, () => {
	const { fixture } = comparisonLoaderTestFixture();
	it("rejects frozen corpus bytes that no longer match their digest", async () => {
		await Bun.write(
			fixture.corpusFile("case-2", "candidate"),
			"tampered corpus\n",
		);

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"case case-2 arm candidate field inputs.files[corpus:inputs/corpus/build/SKILL.md].sha256",
		);
	});
});
