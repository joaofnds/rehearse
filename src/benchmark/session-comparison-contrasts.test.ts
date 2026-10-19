import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import writeComparisonReport from "./comparison-command";
import { writeManifest } from "./session-comparison-group-test-fixture";
import { readMultiCaseSessionReport } from "./session-comparison-report-reader-fixture";
import { comparisonSuiteRoot } from "./session-comparison-workspace-fixture";

const EXPECTED_UPDATED_SUCCESS_RATE_DELTA = 1;

const EXPECTED_LATER_SUCCESS_RATE_DELTA = 0.75;

const root = comparisonSuiteRoot();

async function testEstimatesTheCandidateAgainstBaseline(): Promise<void> {
	const expectedMeanDelta = 0.25;
	const expectedStandardError = 0.25;
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = await readMultiCaseSessionReport(reportFile);
	const [observedFirstQuality] =
		report.contrasts.candidateMinusBaseline.quality;

	expect(observedFirstQuality?.successRate.meanDelta).toBe(expectedMeanDelta);
	expect(observedFirstQuality?.successRate.standardError).toBe(
		expectedStandardError,
	);
	expect(observedFirstQuality?.successRate.caseDeltas).toEqual([
		{ caseId: "case-one", value: 0.5 },
		{ caseId: "case-two", value: 0 },
	]);
}

async function testEstimatesBothContrastsAgainstControl(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = await readMultiCaseSessionReport(reportFile);
	const [observedUpdatedFirstQuality] =
		report.contrasts.candidateMinusControl.quality;
	const [observedLaterFirstQuality] =
		report.contrasts.baselineMinusControl.quality;

	expect(observedUpdatedFirstQuality?.successRate.meanDelta).toBe(
		EXPECTED_UPDATED_SUCCESS_RATE_DELTA,
	);
	expect(observedLaterFirstQuality?.successRate.meanDelta).toBe(
		EXPECTED_LATER_SUCCESS_RATE_DELTA,
	);
}

async function testRetainsCandidateMinusBaselinePassKUncertainty(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = await readMultiCaseSessionReport(reportFile);
	const [observedFirstQuality] =
		report.contrasts.candidateMinusBaseline.quality;

	expect(observedFirstQuality?.passK).toMatchObject({
		caseDeltas: [
			{ caseId: "case-one", value: 0.75 },
			{ caseId: "case-two", value: 0 },
		],
		meanDelta: 0.375,
		standardError: 0.375,
	});
}

async function testRetainsCandidateMinusControlCaseDeltas(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = await readMultiCaseSessionReport(reportFile);
	const [observedUpdatedFirstQuality] =
		report.contrasts.candidateMinusControl.quality;

	expect(observedUpdatedFirstQuality?.successRate).toMatchObject({
		caseDeltas: [
			{ caseId: "case-one", value: 1 },
			{ caseId: "case-two", value: 1 },
		],
		meanDelta: 1,
		standardError: 0,
	});
}

async function testRetainsBaselineMinusControlCaseDeltas(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = await readMultiCaseSessionReport(reportFile);
	const [observedLaterFirstQuality] =
		report.contrasts.baselineMinusControl.quality;

	expect(observedLaterFirstQuality?.successRate).toMatchObject({
		caseDeltas: [
			{ caseId: "case-one", value: 0.5 },
			{ caseId: "case-two", value: 1 },
		],
		meanDelta: 0.75,
		standardError: 0.25,
	});
}

describe("session comparison contrasts", () => {
	it(
		"estimates the candidate against baseline",
		testEstimatesTheCandidateAgainstBaseline,
	);

	it(
		"estimates both contrasts against control",
		testEstimatesBothContrastsAgainstControl,
	);

	it(
		"retains candidate minus baseline pass-k uncertainty",
		testRetainsCandidateMinusBaselinePassKUncertainty,
	);

	it(
		"retains candidate minus control case deltas",
		testRetainsCandidateMinusControlCaseDeltas,
	);

	it(
		"retains baseline minus control case deltas",
		testRetainsBaselineMinusControlCaseDeltas,
	);
});
