import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import type { ReplayDependencies } from "./replay";
import runReplayConfirmation from "./replay-confirmation";
import ReplayCheckpointInputsBuilder from "./replay-confirmation-checkpoint-test-builder";
import ReplayDurableOutcomes from "./replay-confirmation-durable-outcome-test-fixture";
import { readReplayReps } from "./replay-confirmation-worktree-test-fixtures";
import {
	failingBeforeSessionEnds,
	failingBeforeSessionStarts,
	namedFailure,
	readTranscriptLine,
	unnamedFailure,
} from "./stage-live-read-test-fixture";
import { stageTranscriptFile } from "./stage-transcript-evidence";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

const citations = {
	home: "/home/user",
	roots: [{ layoutPath: "rulebook", path: "/home/user/.agents/rulebook" }],
};

/**
 * A stage session that reads the arm's rule through the live install, as one
 * that built the path itself would, and leaves that read in its transcript.
 */
function liveReadingStage(
	projectsDirectory: string,
): (base: ReplayDependencies) => ReplayDependencies {
	return (base) => ({
		...base,
		liveCitations: async () => await Promise.resolve(citations),
		projectsDirectory,
		stageSession: {
			...base.stageSession,
			runWorkflowStage: async (request) => {
				const transcript = await base.stageSession.runWorkflowStage(request);
				await Bun.write(
					stageTranscriptFile(request.targetDir, {
						projectsDirectory,
						sessionId: transcript.sessionId,
					}),
					readTranscriptLine("/home/user/.agents/rulebook/ownership.md"),
				);

				return transcript;
			},
		},
	});
}

/**
 * The first rep's stage is judged and the second's judge rejects it, and
 * both stages ran a session whose transcript shows the read.
 */
async function recordsEachStagesLiveReadsOnItsRepWhetherJudgedOrRejected(): Promise<void> {
	const inputs = await new ReplayCheckpointInputsBuilder().fromRepository(
		testResources,
	);
	const [corpus] = inputs.corpusRoots;
	await Bun.write(
		join(corpus.root, "rulebook/ownership.md"),
		"the arm's rule\n",
	);
	const provider = new ReplayDurableOutcomes();
	const projects = await testResources.createControlDirectory();
	const { dependencies, request } = provider.prepareConfirmation(
		inputs,
		{ reps: 2 },
		provider.override,
		liveReadingStage(projects),
	);

	const outcome = await runReplayConfirmation(dependencies, request);

	const records = await readReplayReps(outcome.repRecordFiles);
	expect(
		records.map(({ stages }) =>
			stages.map((stage) => ("liveReads" in stage ? stage.liveReads : "none")),
		),
	).toEqual([
		[[{ count: 1, path: "rulebook/ownership.md" }]],
		[[{ count: 1, path: "rulebook/ownership.md" }]],
	]);
}

/** Each rep's session ran and its Judge then failed to run at all. */
async function recordsTheLiveReadsOfAStageWhoseJudgeFailed(): Promise<void> {
	const inputs = await new ReplayCheckpointInputsBuilder().fromRepository(
		testResources,
	);
	const [corpus] = inputs.corpusRoots;
	await Bun.write(
		join(corpus.root, "rulebook/ownership.md"),
		"the arm's rule\n",
	);
	const provider = new ReplayDurableOutcomes();
	const projects = await testResources.createControlDirectory();
	const { dependencies, request } = provider.prepareConfirmation(
		inputs,
		{ reps: 2 },
		provider.override,
		liveReadingStage(projects),
		(base) => ({
			...base,
			runStageJudge: async () =>
				await Promise.reject(new Error("synthetic judge failure")),
		}),
	);

	const outcome = await runReplayConfirmation(dependencies, request);

	const records = await readReplayReps(outcome.repRecordFiles);
	expect(records.map(({ stages }) => stages)).toMatchObject([
		[
			{
				liveReads: [{ count: 1, path: "rulebook/ownership.md" }],
				status: "EXECUTION_FAILED",
			},
		],
		[
			{
				liveReads: [{ count: 1, path: "rulebook/ownership.md" }],
				status: "EXECUTION_FAILED",
			},
		],
	]);
}

/** Each rep's session read the rule live and then failed before it ended. */
async function recordsTheLiveReadsOfAStageWhoseSessionFailed(): Promise<void> {
	const inputs = await new ReplayCheckpointInputsBuilder().fromRepository(
		testResources,
	);
	const [corpus] = inputs.corpusRoots;
	await Bun.write(
		join(corpus.root, "rulebook/ownership.md"),
		"the arm's rule\n",
	);
	const provider = new ReplayDurableOutcomes();
	const projects = await testResources.createControlDirectory();
	const { dependencies, request } = provider.prepareConfirmation(
		inputs,
		{ reps: 2 },
		provider.override,
		liveReadingStage(projects),
		failingBeforeSessionEnds,
	);

	const outcome = await runReplayConfirmation(dependencies, request);

	const records = await readReplayReps(outcome.repRecordFiles);
	expect(records.map(({ stages }) => stages)).toMatchObject([
		[
			{
				liveReads: [{ count: 1, path: "rulebook/ownership.md" }],
				status: "EXECUTION_FAILED",
			},
		],
		[
			{
				liveReads: [{ count: 1, path: "rulebook/ownership.md" }],
				status: "EXECUTION_FAILED",
			},
		],
	]);
}

/** Unknown reads stay off the record, since an empty list would claim none. */
async function recordsNoLiveReadsForAStageWhoseSessionNeverStarted({
	failure,
}: {
	readonly failure: (base: ReplayDependencies) => ReplayDependencies;
}): Promise<void> {
	const inputs = await new ReplayCheckpointInputsBuilder().fromRepository(
		testResources,
	);
	const provider = new ReplayDurableOutcomes();
	const projects = await testResources.createControlDirectory();
	const { dependencies, request } = provider.prepareConfirmation(
		inputs,
		{ reps: 2 },
		provider.override,
		liveReadingStage(projects),
		failure,
	);

	const outcome = await runReplayConfirmation(dependencies, request);

	const records = await readReplayReps(outcome.repRecordFiles);
	expect(records.map(({ stages }) => stages)).toMatchObject([
		[{ status: "EXECUTION_FAILED" }],
		[{ status: "EXECUTION_FAILED" }],
	]);
	expect(
		records
			.flatMap(({ stages }) => stages)
			.filter((stage) => "liveReads" in stage),
	).toEqual([]);
}

describe(runReplayConfirmation.name, () => {
	it(
		"records each stage's live reads on its rep, judged or rejected",
		recordsEachStagesLiveReadsOnItsRepWhetherJudgedOrRejected,
	);

	it(
		"records the live reads of a stage whose judge failed",
		recordsTheLiveReadsOfAStageWhoseJudgeFailed,
	);

	it(
		"records the live reads of a stage whose session failed",
		recordsTheLiveReadsOfAStageWhoseSessionFailed,
	);

	it.each([
		{
			failure: failingBeforeSessionStarts(unnamedFailure),
			naming: "no session",
		},
		{
			failure: failingBeforeSessionStarts(namedFailure),
			naming: "a session with no transcript",
		},
	])(
		"records no live reads for a stage that failed naming $naming",
		recordsNoLiveReadsForAStageWhoseSessionNeverStarted,
	);
});
