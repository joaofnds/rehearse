import { describe, expect, it } from "bun:test";
import { basename, join } from "node:path";

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
		installation,
	) => {
		const delivery = await dependencies.installStageCorpusSnapshot(
			snapshotDirectory,
			worktreePath,
			installation,
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
	roots: [
		{ layoutPath: "rulebook", path: "/home/user/.agents/rulebook" },
		{ layoutPath: "skills", path: "/home/user/.agents/skills" },
	],
};

/**
 * Each stage's skill cites the rulebook and itself through the live install,
 * and the stage session keeps the text it found installed.
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
			`Follow /home/user/.agents/rulebook/ownership.md and /home/user/.agents/skills/${stage}/SKILL.md.\n`,
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

	expect([...new Set(installed)]).toEqual(
		["discuss", "build"].map(
			(stage) =>
				`Follow .claude/rulebook/ownership.md and .claude/skills/${stage}/SKILL.md.\n`,
		),
	);
}

async function recordsTheRedirectsOfEveryStageOnTheGroup(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);

	const { override } = await citingStages(harness.corpusRoot);

	const group = await readGroup(await harness.run({}, override));

	expect(group.inputs.corpusDelivery).toEqual({ redirected: 4, rule: 1 });
}

describe(runPipelineConfirmation.name, () => {
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
