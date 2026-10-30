import { describe, expect, it } from "bun:test";
import { dirname, join } from "node:path";

import { z } from "zod";

import { captureStageCorpus } from "./checkpoint";
import { rewriteInstalledSkill } from "./checkpoint-filesystem-test-fixture";
import runReplayConfirmation from "./replay-confirmation";
import ReplayCorpusBuilder from "./replay-confirmation-corpus-test-builder";
import ReplayConfirmationFixtureBuilder from "./replay-confirmation-fixture-builder";
import type { ReplayDependencyOverride } from "./replay-confirmation-test-support";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

const readEntrySchema = z
	.object({ half: z.string(), path: z.string(), sha256: z.string() })
	.loose();

const recordedReadsSchema = z
	.object({ readManifest: z.array(readEntrySchema) })
	.loose();

const rewritingInstall: ReplayDependencyOverride = (dependencies) => ({
	...dependencies,
	installStageCorpusSnapshot: async (
		snapshotDirectory,
		targetDirectory,
		installation,
	) => {
		const delivery = await dependencies.installStageCorpusSnapshot(
			snapshotDirectory,
			targetDirectory,
			installation,
		);
		await rewriteInstalledSkill(targetDirectory, "discuss");

		return delivery;
	},
});

const realCapture: ReplayDependencyOverride = (dependencies) => ({
	...dependencies,
	stageSession: { ...dependencies.stageSession, captureStageCorpus },
});

async function corpusReads(recordFile: string): Promise<readonly unknown[]> {
	const text = await Bun.file(
		join(dirname(recordFile), "stages", "discuss.json"),
	).text();

	return recordedReadsSchema
		.parse(JSON.parse(text))
		.readManifest.filter(({ half }) => half === "corpus")
		.map(({ path, sha256 }) => ({ path, sha256 }));
}

async function recordedCorpusDigests(
	...overrides: readonly ReplayDependencyOverride[]
): Promise<readonly (readonly unknown[])[]> {
	const { harness, run } = await new ReplayConfirmationFixtureBuilder().build(
		testResources,
	);
	const corpus = await new ReplayCorpusBuilder({
		files: [{ content: "discuss skill\n", path: "skills/discuss/SKILL.md" }],
	}).build(testResources);
	const { dependencies, request } = harness.prepareConfirmation(
		{ corpusRoots: [{ kind: "directory", root: corpus }], paths: run.paths },
		{ reps: 2 },
		realCapture,
		...overrides,
	);

	const outcome = await runReplayConfirmation(dependencies, request);

	return await Array.fromAsync(outcome.repRecordFiles, corpusReads);
}

/**
 * Delivery rewrites the installed copy, so a rep record that hashed the
 * install would change its digests for the same authored corpus.
 */
async function hashesTheAuthoredSnapshotNotTheDeliveredInstall(): Promise<void> {
	const authored = await recordedCorpusDigests();

	const delivered = await recordedCorpusDigests(rewritingInstall);

	expect(delivered).toEqual(authored);
}

describe(runReplayConfirmation.name, () => {
	it(
		"hashes the authored snapshot, not the delivered install",
		hashesTheAuthoredSnapshotNotTheDeliveredInstall,
	);
});
