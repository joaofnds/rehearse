import { describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";

import { loadComparisonEvidence } from "./comparison-loader";
import comparisonLoaderTestFixture from "./comparison-loader-test-fixture";
import { parseConfirmationRepRecord } from "./confirmation-record";

const FIRST_REP_ORDINAL = 1;

const SECOND_REP_ORDINAL = 2;

const JSON_INDENTATION_SPACES = 2;

describe(loadComparisonEvidence.name, () => {
	const { fixture } = comparisonLoaderTestFixture();

	it("names a missing referenced rep record", async () => {
		await rm(fixture.repFile("case-2", "control", FIRST_REP_ORDINAL));

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"case case-2 arm control field repRecords[0].path",
		);
	});

	it("names an invalid referenced rep record", async () => {
		await Bun.write(
			fixture.repFile("case-1", "candidate", SECOND_REP_ORDINAL),
			"{}\n",
		);

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"case case-1 arm candidate field repRecords[1].record",
		);
	});

	it("names a rep whose mode disagrees with its source group", async () => {
		const repFile = fixture.repFile("case-1", "baseline", FIRST_REP_ORDINAL);
		const record = parseConfirmationRepRecord(await Bun.file(repFile).text());
		const changed = {
			...record,
			mode: "pipeline" as const,
			outcome: "UNSUCCESSFUL" as const,
		};
		await Bun.write(
			repFile,
			`${JSON.stringify(changed, null, JSON_INDENTATION_SPACES)}\n`,
		);

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"case case-1 arm baseline field repRecords[0].mode",
		);
	});
});
