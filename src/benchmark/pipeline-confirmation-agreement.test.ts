import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import runPipelineConfirmation from "./pipeline-confirmation";
import { readAgreementReport } from "./pipeline-confirmation-report-test-reader";
import {
	PipelineConfirmationHarness,
	completeFinalGrade,
} from "./pipeline-confirmation-test-support";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

async function reportsAgreementOnlyForItsExactJudgeModel(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const calibrationArtifact = {
		calibration: {
			humanReview: {
				findings: [],
				summary: "The human agrees.",
				verdict: "ACCEPT",
			},
		},
		grade: completeFinalGrade("PASS"),
		rubric: "1. `final`: pass the candidate\n",
		stageScorecards: [],
		status: "COMPLETE",
	};
	await Promise.all([
		Bun.write(
			join(harness.runsDirectory, "opus.json"),
			JSON.stringify({ ...calibrationArtifact, judgeModel: "opus" }),
		),
		Bun.write(
			join(harness.runsDirectory, "sonnet.json"),
			JSON.stringify({ ...calibrationArtifact, judgeModel: "sonnet" }),
		),
	]);

	const outcome = await harness.run({ judgeModel: "opus" });
	const report = await readAgreementReport(outcome);

	expect(report.judgeAgreement.baselines).toEqual([
		{
			criteria: [
				{ rubricId: "check-integrity", sampleSize: 1 },
				{ rubricId: "local-checks", sampleSize: 1 },
				{ rubricId: "tests", sampleSize: 1 },
				{ rubricId: "worker", sampleSize: 1 },
			],
			judgeModel: "opus",
		},
	]);
}

describe(runPipelineConfirmation.name, () => {
	describe("when calibrations name different judge models", () => {
		it(
			"reports agreement only for its exact Judge model",
			reportsAgreementOnlyForItsExactJudgeModel,
		);
	});
});
