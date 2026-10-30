import { describe, expect, it } from "bun:test";

import { captureStageCorpus, installStageCorpusSnapshot } from "./checkpoint";
import {
	noCitations,
	rewriteInstalledSkill,
} from "./checkpoint-filesystem-test-fixture";
import { runReplay } from "./replay";
import ReplayConfirmationHarness from "./replay-confirmation-test-support";
import ReplayCorpusVariantBuilder from "./replay-corpus-variant-test-builder";
import ReplaySavedRunBuilder from "./replay-saved-run-test-builder";
import { ReplayRequestBuilder } from "./replay-test-fixtures";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

/**
 * Delivery rewrites the installed copy, so a replay that hashed the install
 * would record other digests than the authored corpus and read it as stale.
 */
async function replaysAgainstTheAuthoredCorpusNotTheDeliveredInstall(): Promise<void> {
	const { source, instructions } = await new ReplayCorpusVariantBuilder().build(
		testResources,
	);
	const expected = await captureStageCorpus("build", instructions, [source]);
	const run = await new ReplaySavedRunBuilder({
		discussCorpus: await captureStageCorpus("discuss", instructions, [source]),
	}).build(testResources);
	const fake = new ReplayConfirmationHarness();

	const outcome = await runReplay(
		{
			...fake.dependencies,
			installStageCorpusSnapshot: async (
				snapshotDirectory,
				targetDirectory,
			) => {
				const delivery = await installStageCorpusSnapshot(
					snapshotDirectory,
					targetDirectory,
					noCitations,
				);
				await rewriteInstalledSkill(targetDirectory, "build");

				return delivery;
			},
			stageSession: { ...fake.dependencies.stageSession, captureStageCorpus },
		},
		{
			...new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
			corpusSource: source,
			instructions,
		},
	);

	expect(outcome.record.corpusFiles).toEqual(expected);
	expect(outcome.record.staleness).toEqual([]);
}

describe(runReplay.name, () => {
	it(
		"replays against the authored corpus, not the delivered install",
		replaysAgainstTheAuthoredCorpusNotTheDeliveredInstall,
	);
});
