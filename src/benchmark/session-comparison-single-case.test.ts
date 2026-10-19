import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { comparisonAttemptHistoryLinks } from "#server/comparison-history-links";
import comparisonReport from "#server/comparisons";

import writeComparisonReport from "./comparison-command";
import { writeManifest } from "./session-comparison-group-test-fixture";
import { readSingleCaseSessionReport } from "./session-comparison-report-reader-fixture";
import { comparisonSuiteRoot } from "./session-comparison-workspace-fixture";

const root = comparisonSuiteRoot();

async function testKeepsRepSamplingForASingleSessionCase(): Promise<void> {
	const expectedCaseCount = 1;
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest(
		{ root, runsDirectory },
		{ caseIds: ["case-one"], selectVariant: undefined },
	);

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = await readSingleCaseSessionReport(reportFile);

	expect(report.cases).toHaveLength(expectedCaseCount);
	expect(report.mode).toBe("session");
	expect(report.declaredStages).toEqual(["checks"]);
	expect(report.samplingUnit).toBe("rep");
}

async function testServesReadingsAndHistoriesForTheSingleDeclaredCase(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest(
		{ root, runsDirectory },
		{ caseIds: ["case-one"], selectVariant: undefined },
	);

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = await readSingleCaseSessionReport(reportFile);

	const attemptHistories = await comparisonAttemptHistoryLinks(
		report,
		runsDirectory,
	);
	const served = comparisonReport(report, attemptHistories);

	expect(Object.keys(served.attribution)).toEqual(["case-one"]);
	expect(Object.keys(served.qualityReadings)).toEqual(["case-one"]);
	expect(Object.keys(served.attemptHistories)).toEqual(["case-one"]);
}

describe("single session case sampling", () => {
	it(
		"keeps rep sampling for a single session case",
		testKeepsRepSamplingForASingleSessionCase,
	);
	it(
		"serves readings and histories for the single declared case",
		testServesReadingsAndHistoriesForTheSingleDeclaredCase,
	);
});
