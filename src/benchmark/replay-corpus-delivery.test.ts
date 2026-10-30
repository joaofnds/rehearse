import { describe, expect, it } from "bun:test";
import { join } from "node:path";

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

/** The stage session keeps the skill text it found installed. */
async function deliversTheSourcesCitationsToTheReplayInstall(): Promise<void> {
	const { source, instructions } = await new ReplayCorpusVariantBuilder().build(
		testResources,
	);
	await Bun.write(
		join(source.root, "skills/build/SKILL.md"),
		"Follow /home/user/.agents/rulebook/ownership.md.\n",
	);
	await Bun.write(join(source.root, "rulebook/ownership.md"), "rule\n");
	const run = await new ReplaySavedRunBuilder({
		discussCorpus: await captureStageCorpus("discuss", instructions, [source]),
	}).build(testResources);
	const fake = new ReplayConfirmationHarness();
	const installed: string[] = [];

	await runReplay(
		{
			...fake.dependencies,
			installStageCorpusSnapshot,
			liveCitations: async () =>
				await Promise.resolve({
					home: "/home/user",
					roots: [
						{ layoutPath: "rulebook", path: "/home/user/.agents/rulebook" },
					],
				}),
			stageSession: {
				...fake.dependencies.stageSession,
				runWorkflowStage: async (request) => {
					installed.push(
						await Bun.file(
							join(request.targetDir, ".claude/skills/build/SKILL.md"),
						).text(),
					);

					return await fake.dependencies.stageSession.runWorkflowStage(request);
				},
			},
		},
		{
			...new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
			corpusSource: source,
			instructions,
		},
	);

	expect(installed).toEqual(["Follow .claude/rulebook/ownership.md.\n"]);
}

/**
 * The source directory stays editable while the replay sets up the target,
 * so a record hashed from it would describe an edit the session never saw.
 */
async function hashesTheSourceAsItWasInstalled(): Promise<void> {
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
			runSetup: async (targetDir, setup, log) => {
				await Bun.write(join(source.root, "skills/build/SKILL.md"), "edited");
				await fake.dependencies.runSetup(targetDir, setup, log);
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
}

describe(runReplay.name, () => {
	it("hashes the source as it was installed", hashesTheSourceAsItWasInstalled);

	it(
		"delivers the source's citations to the replay install",
		deliversTheSourcesCitationsToTheReplayInstall,
	);

	it(
		"replays against the authored corpus, not the delivered install",
		replaysAgainstTheAuthoredCorpusNotTheDeliveredInstall,
	);
});
