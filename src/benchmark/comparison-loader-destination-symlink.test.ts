import { describe, expect, it } from "bun:test";
import { lstat } from "node:fs/promises";

import writeComparisonReport from "./comparison-command";
import linkedReportDestination from "./comparison-destination-symlink-fixture";
import { loadComparisonEvidence } from "./comparison-loader";
import comparisonLoaderTestFixture from "./comparison-loader-test-fixture";
import { parseComparisonReport } from "./comparison-record";

describe(loadComparisonEvidence.name, () => {
	const { fixture, temporaryDirectory } = comparisonLoaderTestFixture();

	it("atomically replaces a destination symlink without changing its target", async () => {
		const expectedCaseCount = 2;

		const { reportFile, runsDirectory, symlinkTarget } =
			await linkedReportDestination({
				manifestFile: fixture.manifestFile,
				temporaryDirectory,
			});

		await writeComparisonReport({
			manifestPath: fixture.manifestFile,
			runsDirectory,
		});

		const reportStats = await lstat(reportFile);
		expect(reportStats.isSymbolicLink()).toBe(false);
		expect(await Bun.file(symlinkTarget).text()).toBe("outside bytes\n");
		const report = parseComparisonReport(await Bun.file(reportFile).text());
		expect(report.cases).toHaveLength(expectedCaseCount);
	});
});
