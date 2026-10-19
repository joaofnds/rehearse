import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { comparisonAttemptHistoryLinks } from "#server/comparison-history-links";

import writeComparisonReport from "./comparison-command";
import type { ComparisonArm } from "./comparison-record";
import { COMPARISON_ARMS } from "./comparison-record";
import {
	writeGroup,
	writeManifest,
} from "./session-comparison-group-test-fixture";
import { everyRepAvailable, link } from "./session-comparison-history-fixture";
import asVersionThreeReport from "./session-comparison-legacy-report-fixture";
import {
	readMultiCaseSessionReport,
	readSessionComparisonReport,
} from "./session-comparison-report-reader-fixture";
import { comparisonSuiteRoot } from "./session-comparison-workspace-fixture";

const FIRST_SOURCE_GROUP_INDEX = 0;

const root = comparisonSuiteRoot();

async function testLinksEveryIntactRepOfAVersion3SessionReport(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = asVersionThreeReport(
		await readMultiCaseSessionReport(reportFile),
	);

	const links = await comparisonAttemptHistoryLinks(report, runsDirectory);

	expect(links).toEqual(everyRepAvailable(["case-one", "case-two"]));
}

async function testLinksEveryIntactRepOfAReportSavedFromAManifestInsideTheRunsDirectory(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestText = await Bun.file(
		await writeManifest({ root, runsDirectory }),
	).text();
	const manifestPath = join(runsDirectory, "act-69", "comparison.json");

	await Bun.write(manifestPath, manifestText);

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = await readMultiCaseSessionReport(reportFile);

	const links = await comparisonAttemptHistoryLinks(report, runsDirectory);
	const [observedFirstCase] = report.cases;

	expect(
		observedFirstCase?.arms.baseline.source.groups[FIRST_SOURCE_GROUP_INDEX]
			?.path,
	).toStartWith("../confirmations/");
	expect(links).toEqual(everyRepAvailable(["case-one", "case-two"]));
}

async function testLinksEachAttemptOfATwoGroupArmToTheGroupItWasRecordedIn(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const arms: Partial<Record<ComparisonArm, readonly string[]>> = {};

	await Array.fromAsync(COMPARISON_ARMS, async (role) => {
		arms[role] = [
			await writeGroup({ root, runsDirectory }, { caseId: "case-one", role }),
			await writeGroup(
				{ root, runsDirectory },
				{ caseId: "case-one", role },
				{
					groupId: `case-one-${role}-again`,
				},
			),
		];
	});

	const manifestPath = join(root, "comparison.json");

	await Bun.write(
		manifestPath,
		`${JSON.stringify({ cases: [{ arms, caseId: "case-one" }], schemaVersion: 1 })}\n`,
	);

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});

	const links = await comparisonAttemptHistoryLinks(
		await readSessionComparisonReport(reportFile),
		runsDirectory,
	);

	expect(links["case-one"]?.baseline).toEqual([
		link({ groupId: "case-one-baseline", groupOrdinal: 1, ordinal: 1 }),
		link({ groupId: "case-one-baseline", groupOrdinal: 2, ordinal: 2 }),
		link({ groupId: "case-one-baseline-again", groupOrdinal: 1, ordinal: 3 }),
		link({ groupId: "case-one-baseline-again", groupOrdinal: 2, ordinal: 4 }),
	]);
}

describe("session comparison history", () => {
	it(
		"links every intact rep of a version-3 session report",
		testLinksEveryIntactRepOfAVersion3SessionReport,
	);

	it(
		"links every intact rep of a report saved from a manifest inside the runs directory",
		testLinksEveryIntactRepOfAReportSavedFromAManifestInsideTheRunsDirectory,
	);

	it(
		"links each attempt of a two-group arm to the group it was recorded in",
		testLinksEachAttemptOfATwoGroupArmToTheGroupItWasRecordedIn,
	);
});
