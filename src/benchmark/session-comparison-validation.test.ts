import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import writeComparisonReport from "./comparison-command";
import { parseComparisonReport } from "./comparison-record";
import withConflictingSessionGrade from "./session-comparison-grade-conflict-fixture";
import { writeManifest } from "./session-comparison-group-test-fixture";
import {
	readMultiCaseSessionReport,
	readSessionComparisonReport,
} from "./session-comparison-report-reader-fixture";
import { comparisonSuiteRoot } from "./session-comparison-workspace-fixture";

const SHA256_HEX_CHARACTERS = 64;

const root = comparisonSuiteRoot();

async function testRejectsPipelineModeForASessionReport(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = await readMultiCaseSessionReport(reportFile);

	expect(() =>
		parseComparisonReport(JSON.stringify({ ...report, mode: "pipeline" })),
	).toThrow();
}

async function testRejectsPipelineStagesForASessionReport(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = await readMultiCaseSessionReport(reportFile);

	expect(() =>
		parseComparisonReport(
			JSON.stringify({ ...report, declaredStages: ["final"] }),
		),
	).toThrow();
}

async function testRejectsJudgeAgreementAttachedToASessionReport(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = await readMultiCaseSessionReport(reportFile);

	expect(() =>
		parseComparisonReport(
			JSON.stringify({
				...report,
				judgeAgreement: {
					baselines: [
						{
							criteria: [
								{
									cohensKappa: null,
									judgeFailHumanFail: 0,
									judgeFailHumanPass: 0,
									judgePassHumanFail: 0,
									judgePassHumanPass: 1,
									observedAgreement: 1,
									rubricId: "checks",
									sampleSize: 1,
								},
							],
							judgeModel: "sonnet",
							rubricSha256: "a".repeat(SHA256_HEX_CHARACTERS),
							stage: "checks",
						},
					],
					skippedCalibrations: 0,
				},
			}),
		),
	).toThrow();
}

async function rejectsSuccessfulFailingGrade(
	grade: "B" | "F",
	gradeDistribution: Readonly<Record<string, number>>,
): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = await readSessionComparisonReport(reportFile);
	const candidate = withConflictingSessionGrade({
		grade,
		gradeDistribution,
		report,
	});

	expect(() => parseComparisonReport(JSON.stringify(candidate))).toThrow();
}

describe("session comparison validation", () => {
	it(
		"rejects pipeline mode for a session report",
		testRejectsPipelineModeForASessionReport,
	);

	it(
		"rejects pipeline stages for a session report",
		testRejectsPipelineStagesForASessionReport,
	);

	it(
		"rejects judge agreement attached to a session report",
		testRejectsJudgeAgreementAttachedToASessionReport,
	);

	it.each([
		[
			"B",
			Object.fromEntries(
				[
					{ count: 1, grade: "B" },
					{ count: 1, grade: "F" },
				].map(({ grade, count }) => [grade, count]),
			),
		],
		[
			"F",
			Object.fromEntries(
				[{ count: 2, grade: "F" }].map(({ grade, count }) => [grade, count]),
			),
		],
	] as const)(
		"rejects a session outcome graded %s while marked successful",
		rejectsSuccessfulFailingGrade,
	);
});
