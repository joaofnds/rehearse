import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { z } from "zod";

import type { CorpusMeasurement } from "#benchmark/corpus-measurement";

import { parseReplayArgs } from "./config";
import { parseConfirmationGroupRecord } from "./confirmation-record";
import runReplayConfirmation from "./replay-confirmation";
import ReplayCorpusBuilder from "./replay-confirmation-corpus-test-builder";
import ReplayConfirmationFixtureBuilder from "./replay-confirmation-fixture-builder";
import { TestResources } from "./test-support";

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
async function writeAgreementBaselines(runsDirectory: string): Promise<void> {
	await Promise.all([
		Bun.write(
			join(runsDirectory, "opus-agreement.json"),
			JSON.stringify({ ...calibrationArtifact, judgeModel: "opus" }),
		),
		Bun.write(
			join(runsDirectory, "sonnet-agreement.json"),
			JSON.stringify({ ...calibrationArtifact, judgeModel: "sonnet" }),
		),
	]);
}
const REPLAY_SETTINGS = [
	"--stage",
	"discuss",
	"--model",
	"sonnet",
	"--session-budget-usd",
	"5",
];
const replayReportSchema = z.object({ judgeAgreement: judgeAgreementSchema });
const testResources = TestResources.forEachTest();
const MEASUREMENT_COUNT_INCREMENT = 1;
const SHA256_HEX_DIGITS = 64;
const expectedMeasurements = 1;
const measuresTheCorpusOnceForTheGroupAndRecordsThat =
	async (): Promise<void> => {
		const { harness, run } = await new ReplayConfirmationFixtureBuilder().build(
			testResources,
		);
		const corpusRoot = await new ReplayCorpusBuilder({
			files: [{ content: "d\n", path: "skills/discuss/SKILL.md" }],
		}).build(testResources);
		let measurements = 0;

		const { dependencies: replayDependencies, request: replayRequest } =
			harness.prepareConfirmation(
				{
					corpusRoots: [{ kind: "directory", root: corpusRoot }],
					paths: run.paths,
				},
				{ reps: 2 },
				(dependencies) => ({
					...dependencies,
					stageSession: {
						...dependencies.stageSession,
						measureCorpus: async () => {
							measurements += MEASUREMENT_COUNT_INCREMENT;

							return await Promise.resolve<CorpusMeasurement>({
								digest: String(measurements).repeat(SHA256_HEX_DIGITS),
								kind: "version",
							});
						},
					},
				}),
			);

		const outcome = await runReplayConfirmation(
			replayDependencies,
			replayRequest,
		);
		const group = parseConfirmationGroupRecord(
			await Bun.file(outcome.groupRecordFile).text(),
		);

		expect(measurements).toBe(expectedMeasurements);
		expect(group.inputs.corpusVersion).toEqual({
			digest: "1".repeat(SHA256_HEX_DIGITS),
			kind: "version",
		});
	};

const reportsAgreementForTheResolvedJudgeModel = async (): Promise<void> => {
	const { harness, run } = await new ReplayConfirmationFixtureBuilder().build(
		testResources,
	);

	await writeAgreementBaselines(run.paths.runsDirectory);
	const corpusRoot = await new ReplayCorpusBuilder({
		files: [
			{ content: "discuss\n", path: "skills/discuss/SKILL.md" },
			{ content: "doctrine\n", path: "skills/doctrine/SKILL.md" },
		],
	}).build(testResources);
	const config = parseReplayArgs(
		["--run", run.paths.name, ...REPLAY_SETTINGS],
		{},
	);

	const { dependencies: replayDependencies, request: replayRequest } =
		harness.prepareConfirmation(
			{
				corpusRoots: [{ kind: "directory", root: corpusRoot }],
				paths: run.paths,
			},
			{ judgeModel: config.judgeModel, model: config.model },
		);

	const outcome = await runReplayConfirmation(
		replayDependencies,
		replayRequest,
	);
	const group = parseConfirmationGroupRecord(
		await Bun.file(outcome.groupRecordFile).text(),
	);

	const report = replayReportSchema.parse(
		JSON.parse(await Bun.file(outcome.reportFile).text()),
	);

	expect({
		judgeModel: group.inputs.judgeModel,
		model: group.inputs.model,
	}).toEqual({ judgeModel: "opus", model: "sonnet" });
	expect(report.judgeAgreement.baselines).toEqual([
		{
			criteria: [{ rubricId: "agreement", sampleSize: 1 }],
			judgeModel: "opus",
		},
	]);
};
describe(runReplayConfirmation.name, () => {
	describe("frozen input readings", () => {
		it(
			"measures the corpus once for the group and records that version on the group",
			measuresTheCorpusOnceForTheGroupAndRecordsThat,
		);
		it(
			"reports agreement for the resolved Judge model",
			reportsAgreementForTheResolvedJudgeModel,
		);
	});
});
