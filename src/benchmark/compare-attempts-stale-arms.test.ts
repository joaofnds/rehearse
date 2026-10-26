import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { compareAttempts } from "./compare-attempts";
import {
	CONSUMED_STAGE,
	recordConsumedCheckpoint,
} from "./compare-attempts-checkpoint-test-fixture";
import {
	RESOURCE_DRAIN_START_INDEX,
	SHARED,
	armsDifferingInOneSkill,
	temporaryDirectories,
} from "./compare-attempts-test-fixture";
import { REPLAYED, RUN } from "./compare-attempts-test-support";
import { directorySource } from "./recorded-runs-fixture-environment";
import { staleCheckpoints } from "./staleness-report";

const CONSUMED_STAGE_SKILL = `skills/${CONSUMED_STAGE}/SKILL.md`;

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(RESOURCE_DRAIN_START_INDEX)
			.map(async (directory) => {
				await rm(directory, { force: true, recursive: true });
			}),
	);
});

async function corpusHoldingConsumedStageSkill(
	content: string,
): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-compare-corpus-"));
	temporaryDirectories.push(root);
	await Bun.write(join(root, "CLAUDE.md"), SHARED["CLAUDE.md"]);
	await Bun.write(join(root, CONSUMED_STAGE_SKILL), content);

	return root;
}

describe(compareAttempts.name, () => {
	describe("when arms A and B replayed from a checkpoint an edit to its stage's skill had already made stale", () => {
		it(
			"runs the baseline group from that checkpoint and saves the comparison",
			runsTheBaselineGroupFromThatCheckpointAndSavesTheComparison,
		);
	});
});

async function runsTheBaselineGroupFromThatCheckpointAndSavesTheComparison(): Promise<void> {
	const { arms, armA, armB } = await armsDifferingInOneSkill();
	const corpus = await corpusHoldingConsumedStageSkill("skill as recorded\n");
	await recordConsumedCheckpoint({
		runsDirectory: arms.runsDirectory,
		source: directorySource(corpus),
	});
	await Bun.write(join(corpus, CONSUMED_STAGE_SKILL), "edited skill\n");
	expect(
		await staleCheckpoints(arms.runsDirectory, directorySource(corpus)),
	).toEqual([
		expect.objectContaining({
			causes: [`${CONSUMED_STAGE_SKILL} changed`],
			id: `checkpoint:${RUN}/${CONSUMED_STAGE}`,
		}),
	]);

	const { reportFile } = await compareAttempts(
		{ armA, armB, runsDirectory: arms.runsDirectory },
		{ runBaselineGroup: arms.runBaselineGroup },
	);

	expect(
		arms.baselineRequests.map(({ run, stage }) => ({ run, stage })),
	).toEqual([REPLAYED]);
	expect(await Bun.file(reportFile).exists()).toBe(true);
}
