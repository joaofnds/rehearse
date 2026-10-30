import { describe, expect, it } from "bun:test";
import { basename } from "node:path";

import runPipelineConfirmation from "./pipeline-confirmation";
import { rejectedStageJudgment } from "./pipeline-confirmation-failure-test-fixtures";
import { readReps } from "./pipeline-confirmation-record-test-reader";
import { PipelineConfirmationHarness } from "./pipeline-confirmation-test-support";
import type { PipelineDependencyOverride } from "./pipeline-confirmation-test-support";
import {
	failingAfterSession,
	readTranscriptLine,
} from "./stage-live-read-test-fixture";
import { stageTranscriptFile } from "./stage-transcript-evidence";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

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

const unreadableTaskState: PipelineDependencyOverride = (dependencies) => ({
	...dependencies,
	stageSession: {
		...dependencies.stageSession,
		readTaskOutput: async () =>
			await Promise.reject(new Error("synthetic task state failure")),
	},
});

async function recordsTheLiveReadsOfAStageWhoseSessionFailed({
	failure,
}: {
	readonly failure: PipelineDependencyOverride;
}): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const projects = await testResources.createControlDirectory();

	const reps = await readReps(
		await harness.run({}, liveReadingStages(projects), failure),
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

	it.each([
		{ failure: failingAfterSession, moment: "before it ended" },
		{ failure: unreadableTaskState, moment: "after it ended" },
	])(
		"records the live reads of a stage whose session failed $moment",
		recordsTheLiveReadsOfAStageWhoseSessionFailed,
	);
});
