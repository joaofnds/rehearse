import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import writeComparisonReport from "./comparison-command";
import { parseComparisonReport } from "./comparison-record";
import { parseConfirmationGroupRecord } from "./confirmation-record";
import { writeManifest } from "./session-comparison-group-test-fixture";
import { sessionGroupFile } from "./session-comparison-record-test-fixture";
import { readMultiCaseSessionReport } from "./session-comparison-report-reader-fixture";
import { PROBE_NOTES } from "./session-comparison-test-contract";
import { comparisonSuiteRoot } from "./session-comparison-workspace-fixture";

const EXPECTED_CANDIDATE_SUCCESS_RATE = 1;

const EXPECTED_CONTROL_SUCCESS_RATE = 0;

const FIRST_QUALITY_SUMMARY_INDEX = 0;

const FIRST_REPORTED_CASE_INDEX = 0;

const root = comparisonSuiteRoot();

async function testReportsTheSessionReportIdentity(): Promise<void> {
	const expectedSchemaVersion = 6;
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = await readMultiCaseSessionReport(reportFile);

	expect(report.schemaVersion).toBe(expectedSchemaVersion);
	expect(report.mode).toBe("session");
	expect(report.declaredStages).toEqual(["checks"]);
	expect(report.judgeAgreement.baselines).toEqual([]);
}

async function testReportsOneChecksOutcomePerArm(): Promise<void> {
	const expectedQualityCount = 1;
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = await readMultiCaseSessionReport(reportFile);
	const [observedFirstCase] = report.cases;

	expect(observedFirstCase?.arms.candidate.quality).toHaveLength(
		expectedQualityCount,
	);
}

async function testReportsSuccessRatesForAllThreeArms(): Promise<void> {
	const expectedSuccessRate = 0.5;
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = await readMultiCaseSessionReport(reportFile);
	const [observedFirstCase] = report.cases;

	expect(
		observedFirstCase?.arms.baseline.quality[FIRST_QUALITY_SUMMARY_INDEX]
			?.successRate,
	).toBe(expectedSuccessRate);
	expect(
		observedFirstCase?.arms.candidate.quality[FIRST_QUALITY_SUMMARY_INDEX]
			?.successRate,
	).toBe(EXPECTED_CANDIDATE_SUCCESS_RATE);
	expect(
		observedFirstCase?.arms.control.quality[FIRST_QUALITY_SUMMARY_INDEX]
			?.successRate,
	).toBe(EXPECTED_CONTROL_SUCCESS_RATE);
}

async function testRetainsEachBaselineRepOutcome(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = await readMultiCaseSessionReport(reportFile);

	expect(
		report.cases[FIRST_REPORTED_CASE_INDEX]?.arms.baseline.source.reps.map(
			({ ordinal, outcomes }) => ({ ordinal, outcomes }),
		),
	).toEqual([
		{
			ordinal: 1,
			outcomes: [
				{
					grade: "A",
					name: "checks",
					status: "JUDGED",
					successful: true,
				},
			],
		},
		{
			ordinal: 2,
			outcomes: [
				{
					grade: "F",
					name: "checks",
					status: "JUDGED",
					successful: false,
				},
			],
		},
	]);
}

async function testReportsASessionCaseWhoseDeclaredSkillFrozeItsWholeDirectory(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest(
		{ root, runsDirectory },
		{ caseIds: ["case-skill"], selectVariant: undefined },
	);
	const group = parseConfirmationGroupRecord(
		await Bun.file(
			sessionGroupFile({
				caseId: "case-skill",
				role: "candidate",
				runsDirectory,
			}),
		).text(),
	);

	expect(group.inputs.files.map(({ path }) => path)).toContain(
		`inputs/corpus/${PROBE_NOTES}`,
	);

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = parseComparisonReport(await Bun.file(reportFile).text());

	expect(report.cases.map(({ caseId }) => caseId)).toEqual(["case-skill"]);
}

describe("session comparison identity", () => {
	it(
		"reports the session report identity",
		testReportsTheSessionReportIdentity,
	);

	it("reports one checks outcome per arm", testReportsOneChecksOutcomePerArm);

	it(
		"reports success rates for all three arms",
		testReportsSuccessRatesForAllThreeArms,
	);

	it("retains each baseline rep outcome", testRetainsEachBaselineRepOutcome);

	it(
		"reports a session case whose declared skill froze its whole directory",
		testReportsASessionCaseWhoseDeclaredSkillFrozeItsWholeDirectory,
	);
});
