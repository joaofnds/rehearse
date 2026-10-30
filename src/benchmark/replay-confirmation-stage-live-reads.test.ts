import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import type { ReplayDependencies } from "./replay";
import runReplayConfirmation from "./replay-confirmation";
import ReplayCheckpointInputsBuilder from "./replay-confirmation-checkpoint-test-builder";
import ReplayDurableOutcomes from "./replay-confirmation-durable-outcome-test-fixture";
import { readReplayReps } from "./replay-confirmation-worktree-test-fixtures";
import { readTranscriptLine } from "./stage-live-read-test-fixture";
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
 * The first rep's stage is judged and the second's judge rejects it, so only
 * the judged stage carries the reads its transcript shows.
 */
async function recordsAJudgedStagesLiveReadsOnItsRep(): Promise<void> {
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
	).toEqual([[[{ count: 1, path: "rulebook/ownership.md" }]], ["none"]]);
}

describe(runReplayConfirmation.name, () => {
	it(
		"records a judged stage's live reads on its rep",
		recordsAJudgedStagesLiveReadsOnItsRep,
	);
});
