import { describe, expect, it } from "bun:test";
import { dirname, join } from "node:path";

import { z } from "zod";

import { captureStageCorpus } from "./checkpoint";
import { parseConfirmationGroupRecord } from "./confirmation-record";
import runReplayConfirmation from "./replay-confirmation";
import ReplayCorpusBuilder from "./replay-confirmation-corpus-test-builder";
import ReplayConfirmationFixtureBuilder from "./replay-confirmation-fixture-builder";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();
async function baselineCorpus(): Promise<string> {
	return await new ReplayCorpusBuilder({
		files: [{ content: "reviewer agent\n", path: "agents/reviewer.md" }],
	}).build(testResources);
}
const freezesAndReplaysTheStagesCorpusWithNoSkillIn =
	async (): Promise<void> => {
		const expectedRepRecordFileCount = 2;

		const { harness, run } = await new ReplayConfirmationFixtureBuilder().build(
			testResources,
		);

		const { dependencies: replayDependencies, request: replayRequest } =
			harness.prepareConfirmation(
				{
					corpusRoots: [{ kind: "directory", root: await baselineCorpus() }],
					paths: run.paths,
				},
				{ reps: 2, stageSkill: "absent" },
			);

		const outcome = await runReplayConfirmation(
			replayDependencies,
			replayRequest,
		);

		const group = parseConfirmationGroupRecord(
			await Bun.file(outcome.groupRecordFile).text(),
		);

		expect(
			group.inputs.files
				.filter(({ kind }) => kind === "corpus")
				.map(({ path }) => path),
		).toEqual([
			"inputs/corpus/discuss/CLAUDE.md",
			"inputs/corpus/discuss/agents/reviewer.md",
		]);
		expect(outcome.repRecordFiles).toHaveLength(expectedRepRecordFileCount);
	};

const declaresNoReadOfTheSkillItRanWithout = async (): Promise<void> => {
	const { harness, run } = await new ReplayConfirmationFixtureBuilder().build(
		testResources,
	);

	const { dependencies: replayDependencies, request: replayRequest } =
		harness.prepareConfirmation(
			{
				corpusRoots: [{ kind: "directory", root: await baselineCorpus() }],
				paths: run.paths,
			},
			{ reps: 2, stageSkill: "absent" },
		);

	const outcome = await runReplayConfirmation(
		replayDependencies,
		replayRequest,
	);

	const corpusReads = await Promise.all(
		outcome.repRecordFiles.map(async (recordFile) => {
			const readManifestSchema = z.array(
				z.object({ half: z.string(), path: z.string() }).loose(),
			);
			const recordText = await Bun.file(
				join(dirname(recordFile), "stages", "discuss.json"),
			).text();

			return z
				.object({
					readManifest: readManifestSchema,
				})
				.parse(JSON.parse(recordText))
				.readManifest.filter(({ half }) => half === "corpus")
				.map(({ path }) => path);
		}),
	);

	expect(corpusReads).toEqual([["CLAUDE.md"], ["CLAUDE.md"]]);
};

const capturesEachRepsSessionCorpusWithoutTheSkill =
	async (): Promise<void> => {
		const { harness, run } = await new ReplayConfirmationFixtureBuilder().build(
			testResources,
		);

		const { dependencies: replayDependencies, request: replayRequest } =
			harness.prepareConfirmation(
				{
					corpusRoots: [{ kind: "directory", root: await baselineCorpus() }],
					paths: run.paths,
				},
				{ reps: 2, stageSkill: "absent" },
				(dependencies) => ({
					...dependencies,
					stageSession: { ...dependencies.stageSession, captureStageCorpus },
				}),
			);

		const outcome = await runReplayConfirmation(
			replayDependencies,
			replayRequest,
		);

		const stageRecords = await Promise.all(
			outcome.repRecordFiles.map(
				async (recordFile) =>
					await Bun.file(
						join(dirname(recordFile), "stages", "discuss.json"),
					).text(),
			),
		);

		expect(stageRecords.filter((text) => text.includes("skills/"))).toEqual([]);
	};

const keepsAnEarlierStagesOwnSkillInThatStagesCorpus =
	async (): Promise<void> => {
		const expectedRepRecordFileCount = 2;

		const { harness, run } = await new ReplayConfirmationFixtureBuilder().build(
			testResources,
		);
		const corpusRoot = await baselineCorpus();
		await Bun.write(
			join(corpusRoot, "skills", "discuss", "SKILL.md"),
			"discuss\n",
		);

		const { dependencies: replayDependencies, request: replayRequest } =
			harness.prepareConfirmation(
				{
					corpusRoots: [{ kind: "directory", root: corpusRoot }],
					paths: run.paths,
				},
				{ reps: 2, stage: "build", stageSkill: "absent" },
			);

		const outcome = await runReplayConfirmation(
			replayDependencies,
			replayRequest,
		);

		const group = parseConfirmationGroupRecord(
			await Bun.file(outcome.groupRecordFile).text(),
		);

		expect(
			group.inputs.files
				.filter(({ kind }) => kind === "corpus")
				.map(({ path }) => path),
		).toContain("inputs/corpus/discuss/skills/discuss/SKILL.md");
		expect(outcome.repRecordFiles).toHaveLength(expectedRepRecordFileCount);
	};
describe(runReplayConfirmation.name, () => {
	describe("when the stage runs without its own skill", () => {
		it(
			"freezes and replays the stage's corpus with no skill in it",
			freezesAndReplaysTheStagesCorpusWithNoSkillIn,
		);

		it(
			"declares no read of the skill it ran without",
			declaresNoReadOfTheSkillItRanWithout,
		);

		it(
			"captures each rep's session corpus without the skill",
			capturesEachRepsSessionCorpusWithoutTheSkill,
		);

		it(
			"keeps an earlier stage's own skill in that stage's corpus",
			keepsAnEarlierStagesOwnSkillInThatStagesCorpus,
		);
	});
});
