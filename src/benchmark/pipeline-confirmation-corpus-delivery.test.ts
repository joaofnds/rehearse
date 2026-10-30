import { describe, expect, it } from "bun:test";
import { basename, join } from "node:path";

import { rewriteInstalledSkill } from "./checkpoint-filesystem-test-fixture";
import runPipelineConfirmation from "./pipeline-confirmation";
import { rejectedStageJudgment } from "./pipeline-confirmation-failure-test-fixtures";
import {
	readCheckpoints,
	readGroup,
	readReps,
} from "./pipeline-confirmation-record-test-reader";
import { PipelineConfirmationHarness } from "./pipeline-confirmation-test-support";
import type { PipelineDependencyOverride } from "./pipeline-confirmation-test-support";
import { readTranscriptLine } from "./stage-live-read-test-fixture";
import { stageTranscriptFile } from "./stage-transcript-evidence";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

async function recordedCorpusFiles(
	...overrides: readonly PipelineDependencyOverride[]
): Promise<readonly (readonly unknown[])[]> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const outcome = await harness.run({}, ...overrides);
	const recorded = await readCheckpoints(outcome);

	return recorded.map(({ corpusFiles }) => corpusFiles);
}

const rewritingInstall: PipelineDependencyOverride = (dependencies) => ({
	...dependencies,
	installStageCorpusSnapshot: async (
		snapshotDirectory,
		worktreePath,
		citations,
	) => {
		const delivery = await dependencies.installStageCorpusSnapshot(
			snapshotDirectory,
			worktreePath,
			citations,
		);
		await rewriteInstalledSkill(worktreePath, basename(snapshotDirectory));

		return delivery;
	},
});

/**
 * Delivery rewrites the installed copy, so a record that hashed the install
 * would change its digests for the same authored corpus.
 */
async function hashesTheAuthoredSnapshotNotTheDeliveredInstall(): Promise<void> {
	const authored = await recordedCorpusFiles();

	const delivered = await recordedCorpusFiles(rewritingInstall);

	expect(delivered).toEqual(authored);
}

async function recordsTheDeliveryRuleAndRedirectCountOnTheGroup(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);

	const group = await readGroup(await harness.run({}));

	expect(group.inputs.corpusDelivery).toEqual({ redirected: 0, rule: 1 });
}

const rulebookCitations = {
	home: "/home/user",
	roots: [{ layoutPath: "rulebook", path: "/home/user/.agents/rulebook" }],
};

/**
 * Each stage's skill cites the rulebook through the live install, and the
 * stage session keeps the text it found installed.
 */
async function citingStages(corpusRoot: string): Promise<{
	readonly installed: readonly string[];
	readonly override: PipelineDependencyOverride;
}> {
	const installed: string[] = [];
	await Bun.write(join(corpusRoot, "rulebook/ownership.md"), "rule\n");
	await Array.fromAsync(["discuss", "build"], async (stage) => {
		await Bun.write(
			join(corpusRoot, "skills", stage, "SKILL.md"),
			"Follow /home/user/.agents/rulebook/ownership.md.\n",
		);
	});

	const override: PipelineDependencyOverride = (dependencies) => ({
		...dependencies,
		liveCitations: async () => await Promise.resolve(rulebookCitations),
		stageSession: {
			...dependencies.stageSession,
			runWorkflowStage: async (request) => {
				installed.push(
					await Bun.file(
						join(
							request.targetDir,
							".claude/skills",
							request.stage,
							"SKILL.md",
						),
					).text(),
				);

				return await dependencies.stageSession.runWorkflowStage(request);
			},
		},
	});

	return { installed, override };
}

async function deliversEachStagesCitationsToItsOwnInstall(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const { installed, override } = await citingStages(harness.corpusRoot);

	await harness.run({}, override);

	expect([...new Set(installed)]).toEqual([
		"Follow .claude/rulebook/ownership.md.\n",
	]);
}

async function recordsTheRedirectsOfEveryStageOnTheGroup(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);

	const { override } = await citingStages(harness.corpusRoot);

	const group = await readGroup(await harness.run({}, override));

	expect(group.inputs.corpusDelivery).toEqual({ redirected: 2, rule: 1 });
}

/**
 * Each stage reads its own installed skill through the live install, as a
 * session that built the path itself would, and leaves that in its transcript.
 */
function liveReadingStages(
	projectsDirectory: string,
): PipelineDependencyOverride {
	return (dependencies) => ({
		...dependencies,
		liveCitations: async () =>
			await Promise.resolve({
				home: "/home/user",
				roots: [{ layoutPath: "skills", path: "/home/user/.agents/skills" }],
			}),
		projectsDirectory,
		stageSession: {
			...dependencies.stageSession,
			runWorkflowStage: async (request) => {
				const transcript =
					await dependencies.stageSession.runWorkflowStage(request);
				await Bun.write(
					stageTranscriptFile(request.targetDir, {
						projectsDirectory,
						sessionId: transcript.sessionId,
					}),
					readTranscriptLine(
						`/home/user/.agents/skills/${request.stage}/SKILL.md`,
					),
				);

				return transcript;
			},
		},
	});
}

async function recordsEachJudgedStagesLiveReadsOnItsRep(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const projects = await testResources.createControlDirectory();

	const reps = await readReps(
		await harness.run({}, liveReadingStages(projects)),
	);

	const stageReads = ["discuss", "build"].map((stage) => ({
		liveReads: [{ count: 1, path: `skills/${stage}/SKILL.md` }],
		stage,
	}));
	expect(
		reps.map(({ stages }) =>
			stages.map((stage) =>
				"liveReads" in stage
					? { liveReads: stage.liveReads, stage: stage.stage }
					: stage.status,
			),
		),
	).toEqual([stageReads, stageReads, stageReads]);
}

const rejectingJudge: PipelineDependencyOverride = (dependencies) => ({
	...dependencies,
	runStageJudge: async () => await Promise.reject(rejectedStageJudgment()),
});

async function recordsTheLiveReadsOfAStageItsJudgeRejected(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const projects = await testResources.createControlDirectory();

	const reps = await readReps(
		await harness.run({}, liveReadingStages(projects), rejectingJudge),
	);

	expect(
		reps.map(({ stages }) =>
			stages.map((stage) => ("liveReads" in stage ? stage.liveReads : "none")),
		),
	).toEqual([
		[[{ count: 1, path: "skills/discuss/SKILL.md" }], "none"],
		[[{ count: 1, path: "skills/discuss/SKILL.md" }], "none"],
		[[{ count: 1, path: "skills/discuss/SKILL.md" }], "none"],
	]);
}

const rejectingCheckpoint: PipelineDependencyOverride = (dependencies) => ({
	...dependencies,
	recordCheckpoint: async (worktreePath, checkpointDirectory, inputs) =>
		basename(checkpointDirectory) === "discuss"
			? await Promise.reject(new Error("synthetic checkpoint rejection"))
			: await dependencies.recordCheckpoint(
					worktreePath,
					checkpointDirectory,
					inputs,
				),
});

async function recordsAJudgedStagesLiveReadsOnceWhenItsCheckpointFails(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const projects = await testResources.createControlDirectory();

	const reps = await readReps(
		await harness.run({}, liveReadingStages(projects), rejectingCheckpoint),
	);

	expect(
		reps.map(({ stages }) =>
			stages.map((stage) => ("liveReads" in stage ? stage.liveReads : "none")),
		),
	).toEqual([
		[[{ count: 1, path: "skills/discuss/SKILL.md" }], "none", "none"],
		[[{ count: 1, path: "skills/discuss/SKILL.md" }], "none", "none"],
		[[{ count: 1, path: "skills/discuss/SKILL.md" }], "none", "none"],
	]);
}

describe(runPipelineConfirmation.name, () => {
	it(
		"records each judged stage's live reads on its rep",
		recordsEachJudgedStagesLiveReadsOnItsRep,
	);

	it(
		"records the live reads of a stage its judge rejected",
		recordsTheLiveReadsOfAStageItsJudgeRejected,
	);

	it(
		"records a judged stage's live reads once when its checkpoint fails",
		recordsAJudgedStagesLiveReadsOnceWhenItsCheckpointFails,
	);

	it(
		"delivers each stage's citations to its own install",
		deliversEachStagesCitationsToItsOwnInstall,
	);

	it(
		"records the redirects of every stage on the group",
		recordsTheRedirectsOfEveryStageOnTheGroup,
	);

	it(
		"records the delivery rule and redirect count on the group",
		recordsTheDeliveryRuleAndRedirectCountOnTheGroup,
	);

	it(
		"hashes the authored snapshot, not the delivered install",
		hashesTheAuthoredSnapshotNotTheDeliveredInstall,
	);
});
