import { describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";

import { digest } from "./comparison-evidence-record-test-fixtures";
import { loadComparisonEvidence } from "./comparison-loader";
import comparisonLoaderTestFixture from "./comparison-loader-test-fixture";

const FIRST_REP_ORDINAL = 1;

const SECOND_REP_ORDINAL = 2;

const FIRST_COMPARISON_CASE_INDEX = 0;

const FIRST_CONFIRMATION_REP_INDEX = 0;

describe(loadComparisonEvidence.name, () => {
	const { fixture } = comparisonLoaderTestFixture();

	it("hashes each judged stage's scorecard as rep evidence", async () => {
		const evidence = await loadComparisonEvidence(fixture.manifestFile);
		const [scorecard] = evidence.cases
			.at(FIRST_COMPARISON_CASE_INDEX)
			?.arms.baseline.reps.at(FIRST_CONFIRMATION_REP_INDEX)?.scorecards ?? [
			undefined,
		];

		expect(scorecard?.path).toBe(
			"groups/case-1-baseline/reps/case-1-baseline-rep-1/stages/build.json",
		);
		const recordText = await Bun.file(
			fixture.scorecardFile("case-1", "baseline", FIRST_REP_ORDINAL),
		).text();
		expect(scorecard?.sha256).toBe(digest(recordText));
		expect(scorecard?.record.grade.hardBlockers).toEqual([
			{ id: "scope-declared", status: "FAIL" },
		]);
	});

	it("names a judged stage whose scorecard is missing", async () => {
		await rm(fixture.scorecardFile("case-1", "control", SECOND_REP_ORDINAL));

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"case case-1 arm control field repRecords[1].stages[0].evidence.recordFile",
		);
	});

	it("names a judged stage whose scorecard is not JSON", async () => {
		await Bun.write(
			fixture.scorecardFile("case-1", "control", SECOND_REP_ORDINAL),
			"{",
		);

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"case case-1 arm control field repRecords[1].stages[0].evidence.recordFile: invalid stage scorecard for build",
		);
	});
});
