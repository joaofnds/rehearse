import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import writeComparisonReport from "./comparison-command";
import { selectUnavailableEvidence } from "./session-comparison-attempt-test-fixture";
import { writeManifest } from "./session-comparison-group-test-fixture";
import { readSessionComparisonReport } from "./session-comparison-report-reader-fixture";
import { comparisonSuiteRoot } from "./session-comparison-workspace-fixture";

const FIRST_REPORTED_CASE_INDEX = 0;

const FIRST_QUALITY_SUMMARY_INDEX = 0;

const SECOND_REP_INDEX = 1;

const root = comparisonSuiteRoot();

async function testRetainsAttemptedAndFailedCountsForAReplylessCandidate(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest(
		{ root, runsDirectory },
		{ selectVariant: selectUnavailableEvidence },
	);

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = await readSessionComparisonReport(reportFile);

	const candidate =
		report.cases[FIRST_REPORTED_CASE_INDEX]?.arms.candidate.quality[
			FIRST_QUALITY_SUMMARY_INDEX
		];

	expect(candidate).toMatchObject({
		attempted: 1,
		failed: 1,
		notReached: 1,
		requested: 2,
		successful: 0,
	});
}

async function testRetainsAttemptedAndFailedCountsWhenBaselineMetricsAreMissing(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest(
		{ root, runsDirectory },
		{ selectVariant: selectUnavailableEvidence },
	);

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = await readSessionComparisonReport(reportFile);

	const baseline =
		report.cases[FIRST_REPORTED_CASE_INDEX]?.arms.baseline.quality[
			FIRST_QUALITY_SUMMARY_INDEX
		];

	expect(baseline).toMatchObject({
		attempted: 2,
		failed: 1,
		notReached: 0,
		requested: 2,
		successful: 1,
	});
}

async function testDistinguishesMissingRepliesFromExecutionFailures(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest(
		{ root, runsDirectory },
		{ selectVariant: selectUnavailableEvidence },
	);

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = await readSessionComparisonReport(reportFile);

	expect(
		report.cases[FIRST_REPORTED_CASE_INDEX]?.arms.candidate.source.reps.map(
			({ outcomes }) => outcomes,
		),
	).toEqual([
		[
			{
				name: "checks",
				status: "NOT_REACHED",
				successful: false,
			},
		],
		[
			{
				name: "checks",
				status: "EXECUTION_FAILED",
				successful: false,
			},
		],
	]);
}

async function testRecordsWhyABaselineRepHasNoMetrics(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest(
		{ root, runsDirectory },
		{ selectVariant: selectUnavailableEvidence },
	);

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = await readSessionComparisonReport(reportFile);

	const observedSecondRep =
		report.cases[FIRST_REPORTED_CASE_INDEX]?.arms.baseline.source.reps[
			SECOND_REP_INDEX
		];

	expect(observedSecondRep?.outcomes).toEqual([
		{
			name: "checks",
			status: "METRICS_MISSING",
			successful: false,
		},
	]);
}

async function testMarksBaselineResourcesUnavailableWhenARepHasNoMetrics(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest(
		{ root, runsDirectory },
		{ selectVariant: selectUnavailableEvidence },
	);

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = await readSessionComparisonReport(reportFile);

	expect(
		report.cases[FIRST_REPORTED_CASE_INDEX]?.arms.baseline.resources.status,
	).toBe("UNAVAILABLE");
}

describe("session comparison missing evidence", () => {
	it(
		"retains attempted and failed counts for a replyless candidate",
		testRetainsAttemptedAndFailedCountsForAReplylessCandidate,
	);

	it(
		"retains attempted and failed counts when baseline metrics are missing",
		testRetainsAttemptedAndFailedCountsWhenBaselineMetricsAreMissing,
	);

	it(
		"distinguishes missing replies from execution failures",
		testDistinguishesMissingRepliesFromExecutionFailures,
	);

	it(
		"records why a baseline rep has no metrics",
		testRecordsWhyABaselineRepHasNoMetrics,
	);

	it(
		"marks baseline resources unavailable when a rep has no metrics",
		testMarksBaselineResourcesUnavailableWhenARepHasNoMetrics,
	);
});
