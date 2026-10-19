import { describe, expect, it } from "bun:test";
import { dirname, join } from "node:path";

import { z } from "zod";

import type { ConfirmationRepRecord } from "./confirmation-record";
import { confirmationRepRecordSchema } from "./confirmation-record";
import runReplayConfirmation from "./replay-confirmation";
import ReplayCorpusBuilder from "./replay-confirmation-corpus-test-builder";
import ReplayConfirmationFixtureBuilder from "./replay-confirmation-fixture-builder";
import ReplayPaidProvider from "./replay-confirmation-paid-provider-test-fixture";
import ReplayStageSessionHarness from "./replay-confirmation-stage-test-harness";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();
const readManifestSchema = z.array(
	z.object({ half: z.string(), path: z.string() }).loose(),
);

function parseConfirmationRepRecord(text: string): ConfirmationRepRecord {
	return confirmationRepRecordSchema.parse(JSON.parse(text));
}

const carriesProductOwnerProviderCallsIntoReplayEvidence =
	async (): Promise<void> => {
		const { harness: fake, run: recorded } =
			await new ReplayConfirmationFixtureBuilder().build(testResources);
		const provider = new ReplayPaidProvider(
			recorded.manifest,
		).withMissingOwnerMetrics();
		const corpusRoot = await new ReplayCorpusBuilder({
			files: [
				{ content: "discuss\n", path: "skills/discuss/SKILL.md" },
				{ content: "doctrine\n", path: "skills/doctrine/SKILL.md" },
			],
			prefix: "replay-po-corpus-",
		}).build(testResources);

		const { dependencies: replayDependencies, request: replayRequest } =
			fake.prepareConfirmation(
				{
					corpusRoots: [{ kind: "directory", root: corpusRoot }],
					paths: recorded.paths,
				},
				{},
				provider.override,
				provider.ownerOverride,
				provider.judgeOverride,
			);

		const outcome = await runReplayConfirmation(
			replayDependencies,
			replayRequest,
		);
		const [recordFile] = outcome.repRecordFiles;
		const record = parseConfirmationRepRecord(
			await Bun.file(recordFile ?? "missing").text(),
		);

		expect(record.metrics).toEqual({
			calls: [
				{ metrics: provider.metric, role: "worker" },
				{ metrics: provider.metric, role: "product-owner" },
				{ metrics: provider.metric, role: "stage-judge" },
			],
			missing: ["product-owner call metrics"],
			status: "MISSING",
		});
	};

const recordsOnEachRepsStageFileTheJudgeRubricIt = async (): Promise<void> => {
	const { harness, run } = await new ReplayConfirmationFixtureBuilder().build(
		testResources,
	);

	const corpusRoot = await new ReplayCorpusBuilder({
		files: [{ content: "d\n", path: "skills/discuss/SKILL.md" }],
	}).build(testResources);

	const { dependencies: replayDependencies, request: replayRequest } =
		harness.prepareConfirmation(
			{
				corpusRoots: [{ kind: "directory", root: corpusRoot }],
				paths: run.paths,
			},
			{ reps: 2 },
		);

	const outcome = await runReplayConfirmation(
		replayDependencies,
		replayRequest,
	);

	const rubricEntries = await Promise.all(
		outcome.repRecordFiles.map(async (recordFile) => {
			const recordText = await Bun.file(
				join(dirname(recordFile), "stages", "discuss.json"),
			).text();
			return z
				.object({
					readManifest: readManifestSchema,
				})
				.parse(JSON.parse(recordText))
				.readManifest.filter(({ half }) => half === "rubric")
				.map(({ path, half, role }) => ({ half, path, role }));
		}),
	);

	expect(rubricEntries).toEqual([
		[{ half: "rubric", path: "rubrics/discuss.json", role: "judge rubric" }],
		[{ half: "rubric", path: "rubrics/discuss.json", role: "judge rubric" }],
	]);
};

const keepsTheStagesReadsOnTheStageFileOfA = async (): Promise<void> => {
	const { harness, run } = await new ReplayConfirmationFixtureBuilder().build(
		testResources,
	);
	const corpusRoot = await new ReplayCorpusBuilder({
		files: [{ content: "d\n", path: "skills/discuss/SKILL.md" }],
	}).build(testResources);

	const { dependencies: replayDependencies, request: replayRequest } =
		harness.prepareConfirmation(
			{
				corpusRoots: [{ kind: "directory", root: corpusRoot }],
				paths: run.paths,
			},
			{ reps: 2 },
			(dependencies) => ({
				...dependencies,
				currentSha: async () => await Promise.resolve(run.manifest.taskSha),
				runStageJudge: ReplayStageSessionHarness.rejectsJudgeOutput,
			}),
		);

	const outcome = await runReplayConfirmation(
		replayDependencies,
		replayRequest,
	);
	const rubricEntries = await Promise.all(
		outcome.repRecordFiles.map(async (recordFile) => {
			const recordText = await Bun.file(
				join(dirname(recordFile), "stages", "discuss.json"),
			).text();
			return z
				.object({
					readManifest: readManifestSchema,
					status: z.literal("REJECTED"),
				})
				.parse(JSON.parse(recordText))
				.readManifest.filter(({ half }) => half === "rubric")
				.map(({ path, half, role }) => ({ half, path, role }));
		}),
	);

	expect(rubricEntries).toEqual([
		[{ half: "rubric", path: "rubrics/discuss.json", role: "judge rubric" }],
		[{ half: "rubric", path: "rubrics/discuss.json", role: "judge rubric" }],
	]);
};
describe(runReplayConfirmation.name, () => {
	describe("stage records", () => {
		it(
			"carries Product Owner provider calls into replay evidence",
			carriesProductOwnerProviderCallsIntoReplayEvidence,
		);

		it(
			"records on each rep's stage file the judge rubric it was graded by",
			recordsOnEachRepsStageFileTheJudgeRubricIt,
		);

		it(
			"keeps the stage's reads on the stage file of a rep whose judge rejected it",
			keepsTheStagesReadsOnTheStageFileOfA,
		);
	});
});
