import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import writeComparisonReport from "./comparison-command";
import { SHA256_HEX_CHARACTERS } from "./comparison-evidence-record-test-fixtures";
import { useJudgeModel } from "./comparison-frozen-evidence-test-fixtures";
import { loadComparisonEvidence } from "./comparison-loader";
import comparisonLoaderTestFixture from "./comparison-loader-test-fixture";

const MULTIPLE_GROUP_COMPARISON_REPORT_VERSION = 6;

const calibrationArtifact = {
	calibration: {
		humanReview: {
			findings: [],
			summary: "The human agrees.",
			verdict: "ACCEPT",
		},
	},
	grade: {
		requirements: [
			{
				evidence: [
					{
						claim: "calibrated evidence",
						path: "change.diff",
						source: "diff",
					},
				],
				id: "agreement",
				status: "PASS",
			},
		],
		summary: "calibrated grade",
		verdict: "PASS",
	},
	judgeContractSha256: "a".repeat(SHA256_HEX_CHARACTERS),
	rubric: "1. `agreement`: calibrated\n",
	stageScorecards: [],
	status: "COMPLETE",
};

const criteriaSchema = z.array(
	z.object({ rubricId: z.string(), sampleSize: z.number() }),
);

const baselinesSchema = z.array(
	z.object({
		criteria: criteriaSchema,
		judgeModel: z.string(),
	}),
);

const judgeAgreementSchema = z.object({
	baselines: baselinesSchema,
});

describe(loadComparisonEvidence.name, () => {
	const { fixture, temporaryDirectory } = comparisonLoaderTestFixture();

	it("reports agreement for every represented Judge model and no others", async () => {
		const runsDirectory = join(temporaryDirectory, "agreement-output");
		await mkdir(runsDirectory);
		await useJudgeModel(fixture, "case-2", "sonnet");

		await Promise.all([
			Bun.write(
				join(runsDirectory, "opus.json"),
				JSON.stringify({ ...calibrationArtifact, judgeModel: "opus" }),
			),
			Bun.write(
				join(runsDirectory, "sonnet.json"),
				JSON.stringify({ ...calibrationArtifact, judgeModel: "sonnet" }),
			),
			Bun.write(
				join(runsDirectory, "haiku.json"),
				JSON.stringify({ ...calibrationArtifact, judgeModel: "haiku" }),
			),
		]);

		const reportFile = await writeComparisonReport({
			manifestPath: fixture.manifestFile,
			runsDirectory,
		});

		const report = z
			.object({
				judgeAgreement: judgeAgreementSchema,
				schemaVersion: z.literal(MULTIPLE_GROUP_COMPARISON_REPORT_VERSION),
			})
			.parse(JSON.parse(await Bun.file(reportFile).text()));

		expect(report.judgeAgreement.baselines).toEqual([
			{
				criteria: [{ rubricId: "agreement", sampleSize: 1 }],
				judgeModel: "opus",
			},
			{
				criteria: [{ rubricId: "agreement", sampleSize: 1 }],
				judgeModel: "sonnet",
			},
		]);
	});
});
