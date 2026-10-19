import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import writeComparisonReport from "./comparison-command";
import { loadComparisonEvidence } from "./comparison-loader";
import comparisonLoaderTestFixture from "./comparison-loader-test-fixture";
import usePipelineCheckpoints from "./comparison-pipeline-evidence-test-fixtures";
import { parseComparisonReport } from "./comparison-record";

const FIRST_REPORTED_CASE_INDEX = 0;

describe(loadComparisonEvidence.name, () => {
	const { fixture, temporaryDirectory } = comparisonLoaderTestFixture();

	it("records a pipeline rep's words from its last declared stage", async () => {
		await usePipelineCheckpoints(fixture);
		const runsDirectory = join(temporaryDirectory, "pipeline-words-output");
		await mkdir(runsDirectory);

		const reportFile = await writeComparisonReport({
			manifestPath: fixture.manifestFile,
			runsDirectory,
		});

		const report = parseComparisonReport(await Bun.file(reportFile).text());
		const [rep] =
			report.cases[FIRST_REPORTED_CASE_INDEX]?.arms.candidate.source.reps ?? [];
		expect(report.mode).toBe("pipeline");
		expect(rep !== undefined && "words" in rep && rep.words).toEqual({
			state: "available",
			words: 3,
		});
	});
});
