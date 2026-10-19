import { describe, expect, it } from "bun:test";

import { loadComparisonEvidence } from "./comparison-loader";
import comparisonLoaderTestFixture from "./comparison-loader-test-fixture";

const JSON_INDENTATION_SPACES = 2;

const SHA256_HEX_CHARACTERS = 64;

const sessionGroupWithoutFrozenCase = {
	approval: { approved: true, method: "yes" },
	caseId: "case-1",
	declaredStages: ["checks"],
	groupId: "session-group",
	inputs: {
		files: [
			{
				kind: "case",
				path: "inputs/case.json",
				sha256: "a".repeat(SHA256_HEX_CHARACTERS),
			},
		],
		lineage: { kind: "SESSION", lineage: "lineage-1" },
		model: "sonnet",
		sessionBudgetUsd: 0.2,
	},
	makespanMs: 1,
	mode: "session",
	preflight: { missing: "metrics", status: "MISSING" },
	projectedCost: {
		perRepMaximumUsd: 0.2,
		preflightMaximumUsd: 0.1,
		reps: 2,
		totalMaximumUsd: 0.5,
	},
	repRecords: [{ ordinal: 1 }, { ordinal: 2 }].map(({ ordinal }) => ({
		ordinal,
		path: `reps/session-group-rep-${ordinal}/rep.json`,
		repId: `session-group-rep-${ordinal}`,
	})),
	reportFile: "report.json",
	reps: 2,
	schemaVersion: 2,
};

describe(loadComparisonEvidence.name, () => {
	const { fixture } = comparisonLoaderTestFixture();

	it("names a session group with a missing frozen case", async () => {
		await Bun.write(
			fixture.groupFile("case-1", "control"),
			`${JSON.stringify(
				sessionGroupWithoutFrozenCase,
				null,
				JSON_INDENTATION_SPACES,
			)}\n`,
		);

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"inputs.files[case:inputs/case.json].path",
		);
	});
});
