import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { captureStageCorpus, installCorpusDirectory } from "./checkpoint";
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
			installCorpusDirectory: async (snapshotDirectory, targetDirectory) => {
				const delivery = await installCorpusDirectory(
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

const ruleAndSkillCitations = {
	home: "/home/user",
	roots: [
		{ layoutPath: "rulebook", path: "/home/user/.agents/rulebook" },
		{ layoutPath: "skills", path: "/home/user/.agents/skills" },
	],
};

/**
 * A replay installs the whole directory, so a skill the directory lacks is
 * missing in the session rather than read from the live install.
 */
async function deliversTheSourcesCitationsToTheReplayInstall(): Promise<void> {
	const { source, instructions } = await new ReplayCorpusVariantBuilder().build(
		testResources,
	);
	await Bun.write(
		join(source.root, "skills/build/SKILL.md"),
		"Follow /home/user/.agents/rulebook/ownership.md and /home/user/.agents/skills/gone/SKILL.md.\n",
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
			installCorpusDirectory,
			liveCitations: async () => await Promise.resolve(ruleAndSkillCitations),
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

	expect(installed).toEqual([
		"Follow .claude/rulebook/ownership.md and .claude/skills/gone/SKILL.md.\n",
	]);
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

/** A file the upstream stage loaded beyond its corpus is judged from the copy too. */
async function judgesStalenessFromTheSourceAsItWasInstalled(): Promise<void> {
	const { source, instructions } = await new ReplayCorpusVariantBuilder().build(
		testResources,
	);
	await Bun.write(join(source.root, "skills/shape/SKILL.md"), "shape");
	const run = await new ReplaySavedRunBuilder({
		discussCorpus: await captureStageCorpus("discuss", instructions, [source]),
		discussReads: [
			{
				evidence: "observed",
				half: "corpus",
				path: "skills/shape/SKILL.md",
				role: "read for context",
				sha256: new Bun.CryptoHasher("sha256").update("shape").digest("hex"),
			},
		],
	}).build(testResources);
	const fake = new ReplayConfirmationHarness();

	const outcome = await runReplay(
		{
			...fake.dependencies,
			runSetup: async (targetDir, setup, log) => {
				await Bun.write(join(source.root, "skills/shape/SKILL.md"), "edited");
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

	expect(outcome.record.staleness).toEqual([]);
}

describe(runReplay.name, () => {
	it(
		"judges staleness from the source as it was installed",
		judgesStalenessFromTheSourceAsItWasInstalled,
	);

	it("hashes the source as it was installed", hashesTheSourceAsItWasInstalled);

	it(
		"delivers the source's citations, absent skills included, to the replay install",
		deliversTheSourcesCitationsToTheReplayInstall,
	);

	it(
		"replays against the authored corpus, not the delivered install",
		replaysAgainstTheAuthoredCorpusNotTheDeliveredInstall,
	);
});
