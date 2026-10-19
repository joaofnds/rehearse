import { describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import writeComparisonReport from "./comparison-command";
import { digest } from "./comparison-evidence-record-test-fixtures";
import { pointFrozenInputAt } from "./comparison-frozen-evidence-test-fixtures";
import { loadComparisonEvidence } from "./comparison-loader";
import comparisonLoaderTestFixture from "./comparison-loader-test-fixture";
import { comparisonReportPaths } from "./run-layout";

const FIRST_REP_ORDINAL = 1;

describe(loadComparisonEvidence.name, () => {
	const { fixture, temporaryDirectory } = comparisonLoaderTestFixture();

	it("creates no comparison layout when source validation fails", async () => {
		const runsDirectory = join(temporaryDirectory, "comparison-output");
		await rm(fixture.repFile("case-1", "baseline", FIRST_REP_ORDINAL));

		expect(
			writeComparisonReport({
				manifestPath: fixture.manifestFile,
				runsDirectory,
			}),
		).rejects.toThrow("case case-1 arm baseline field repRecords[0].path");
		expect(await Bun.file(runsDirectory).exists()).toBe(false);
	});

	it("rejects a report destination that is also frozen source evidence", async () => {
		const runsDirectory = join(temporaryDirectory, "comparison-output");
		const manifestSha = digest(await Bun.file(fixture.manifestFile).text());
		const { reportFile } = comparisonReportPaths(runsDirectory, manifestSha);
		await mkdir(dirname(reportFile), { recursive: true });
		await Bun.write(reportFile, "source task evidence\n");
		await pointFrozenInputAt(fixture, "task", reportFile);

		expect(
			writeComparisonReport({
				manifestPath: fixture.manifestFile,
				runsDirectory,
			}),
		).rejects.toThrow("destination overlaps source evidence");
		expect(await Bun.file(reportFile).text()).toBe("source task evidence\n");
	});
});
