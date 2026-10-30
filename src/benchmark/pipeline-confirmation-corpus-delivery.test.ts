import { describe, expect, it } from "bun:test";
import { basename } from "node:path";

import { rewriteInstalledSkill } from "./checkpoint-filesystem-test-fixture";
import runPipelineConfirmation from "./pipeline-confirmation";
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

describe(runPipelineConfirmation.name, () => {
	it(
		"records each judged stage's live reads on its rep",
		recordsEachJudgedStagesLiveReadsOnItsRep,
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
