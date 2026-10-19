import { describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";

import { loadComparisonEvidence } from "./comparison-loader";
import comparisonLoaderTestFixture from "./comparison-loader-test-fixture";

describe(loadComparisonEvidence.name, () => {
	const { fixture } = comparisonLoaderTestFixture();

	it("names a missing source group before report creation", async () => {
		await rm(fixture.groupFile("case-1", "control"));

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"case case-1 arm control field group.path",
		);
	});

	it("names an invalid source group before report creation", async () => {
		await Bun.write(fixture.groupFile("case-2", "baseline"), "{}\n");

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"case case-2 arm baseline field group.record",
		);
	});
});
