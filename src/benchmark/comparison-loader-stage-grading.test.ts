import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import writeComparisonReport from "./comparison-command";
import { digest } from "./comparison-evidence-record-test-fixtures";
import { loadComparisonEvidence } from "./comparison-loader";
import comparisonLoaderTestFixture from "./comparison-loader-test-fixture";
import { parseComparisonReport } from "./comparison-record";

const FIRST_REP_ORDINAL = 1;

const FIRST_REPORTED_CASE_INDEX = 0;

describe(loadComparisonEvidence.name, () => {
	const { fixture, temporaryDirectory } = comparisonLoaderTestFixture();

	it("records each stage rep's blocker firings, dimension grades and words", async () => {
		const runsDirectory = join(temporaryDirectory, "grading-output");
		await mkdir(runsDirectory);

		const reportFile = await writeComparisonReport({
			manifestPath: fixture.manifestFile,
			runsDirectory,
		});

		const report = parseComparisonReport(await Bun.file(reportFile).text());
		const [rep] =
			report.cases[FIRST_REPORTED_CASE_INDEX]?.arms.baseline.source.reps ?? [];
		const recordText = await Bun.file(
			fixture.scorecardFile("case-1", "baseline", FIRST_REP_ORDINAL),
		).text();
		expect(
			rep !== undefined && "stageGrading" in rep && rep.stageGrading,
		).toEqual([
			{
				dimensions: [{ grade: "C", id: "clarity" }],
				hardBlockers: [{ fired: true, id: "scope-declared" }],
				scorecard: {
					path: "groups/case-1-baseline/reps/case-1-baseline-rep-1/stages/build.json",
					sha256: digest(recordText),
				},
				stage: "build",
			},
		]);
		expect(rep !== undefined && "words" in rep && rep.words).toEqual({
			state: "available",
			words: 7,
		});
	});
});
