import { describe, expect, it } from "bun:test";
import { basename } from "node:path";

import { rewriteInstalledSkill } from "./checkpoint-filesystem-test-fixture";
import runPipelineConfirmation from "./pipeline-confirmation";
import {
	readCheckpoints,
	readGroup,
} from "./pipeline-confirmation-record-test-reader";
import { PipelineConfirmationHarness } from "./pipeline-confirmation-test-support";
import type { PipelineDependencyOverride } from "./pipeline-confirmation-test-support";
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

describe(runPipelineConfirmation.name, () => {
	it(
		"records the delivery rule and redirect count on the group",
		recordsTheDeliveryRuleAndRedirectCountOnTheGroup,
	);

	it(
		"hashes the authored snapshot, not the delivered install",
		hashesTheAuthoredSnapshotNotTheDeliveredInstall,
	);
});
