import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import writeComparisonReport from "./comparison-command";
import { stopOneRepBeforeItsLastStage } from "./comparison-grading-evidence-test-fixtures";
import { loadComparisonEvidence } from "./comparison-loader";
import comparisonLoaderTestFixture from "./comparison-loader-test-fixture";
import usePipelineCheckpoints from "./comparison-pipeline-evidence-test-fixtures";
import { parseComparisonReport } from "./comparison-record";
import { STOPPED_BEFORE_LAST_STAGE_REASON } from "./comparison-report-arm";

const FIRST_REPORTED_CASE_INDEX = 0;

describe(loadComparisonEvidence.name, () => {
	const { fixture, temporaryDirectory } = comparisonLoaderTestFixture();

	it("reads a pipeline rep stopped before its last declared stage as unavailable, never its earlier stage's words", async () => {
		await usePipelineCheckpoints(fixture);
		await stopOneRepBeforeItsLastStage(fixture, {
			ordinal: 1,
			role: "candidate",
		});
		const runsDirectory = join(temporaryDirectory, "stopped-words-output");
		await mkdir(runsDirectory);

		const reportFile = await writeComparisonReport({
			manifestPath: fixture.manifestFile,
			runsDirectory,
		});

		const report = parseComparisonReport(await Bun.file(reportFile).text());
		const reps =
			report.cases[FIRST_REPORTED_CASE_INDEX]?.arms.candidate.source.reps ?? [];
		expect(reps.map((rep) => "words" in rep && rep.words)).toEqual([
			{ reason: STOPPED_BEFORE_LAST_STAGE_REASON, state: "unavailable" },
			{ state: "available", words: 4 },
		]);
	});
});
