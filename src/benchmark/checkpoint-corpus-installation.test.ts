import { describe, expect, it } from "bun:test";
import { rm, stat } from "node:fs/promises";
import { join } from "node:path";

import {
	captureStageCorpus,
	installStageCorpusSnapshot,
	snapshotStageCorpus,
} from "./checkpoint";
import { corpusSources } from "./checkpoint-corpus-test-fixture";
import { noCitations } from "./checkpoint-filesystem-test-fixture";
import {
	installReviewedBuild,
	installationFixture,
} from "./checkpoint-installation-test-fixture";
import { TestResources } from "./test-support";

const HOME_CORPUS_ROOT_INDEX = 1;

const testResources = TestResources.forEachTest();

async function testInstallsFrozenSkillBytesAfterTheirSourceChanges(): Promise<void> {
	const {
		roots,
		firstSnapshot: snapshotDirectory,
		worktree: firstWorktree,
		secondWorktree,
	} = await installationFixture(testResources);

	const frozen = await snapshotStageCorpus(
		{ instructions: "instructions", skill: "discuss" },
		corpusSources(roots),
		snapshotDirectory,
	);

	await Bun.write(
		join(roots[HOME_CORPUS_ROOT_INDEX], "skills", "discuss", "SKILL.md"),
		"changed skill",
	);

	await Promise.all([
		installStageCorpusSnapshot(snapshotDirectory, firstWorktree, noCitations),
		installStageCorpusSnapshot(snapshotDirectory, secondWorktree, noCitations),
	]);

	const first = await captureStageCorpus(
		"discuss",
		"instructions",
		corpusSources([join(firstWorktree, ".claude")]),
	);
	const second = await captureStageCorpus(
		"discuss",
		"instructions",
		corpusSources([join(secondWorktree, ".claude")]),
	);
	expect(first).toEqual(frozen);
	expect(second).toEqual(frozen);
	expect(
		await Bun.file(
			join(firstWorktree, ".claude", "skills", "discuss", "SKILL.md"),
		).text(),
	).toBe("discuss skill");
}

async function testInstallsTheFrozenInstructionsAsCLAUDEMdUnderTheTargetSClaudeDirectory(): Promise<void> {
	const {
		roots,
		firstSnapshot: snapshotDirectory,
		worktree,
	} = await installationFixture(testResources);

	await snapshotStageCorpus(
		{ instructions: "frozen instructions", skill: "discuss" },
		corpusSources(roots),
		snapshotDirectory,
	);

	await installStageCorpusSnapshot(snapshotDirectory, worktree, noCitations);

	expect(await Bun.file(join(worktree, ".claude", "CLAUDE.md")).text()).toBe(
		"frozen instructions",
	);
}

async function testRemovesAPriorStageSAgentsAndOutputStylesTheNextStageSSnapshotDoesNotCarry(): Promise<void> {
	const { roots, firstSnapshot, secondSnapshot, worktree } =
		await installationFixture(testResources);
	await installReviewedBuild(roots);

	await snapshotStageCorpus(
		{ instructions: "instructions", skill: "discuss" },
		corpusSources(roots),
		firstSnapshot,
	);
	await installStageCorpusSnapshot(firstSnapshot, worktree, noCitations);
	expect(
		await stat(join(worktree, ".claude", "agents", "reviewer.md")),
	).toBeDefined();

	await rm(join(roots[HOME_CORPUS_ROOT_INDEX], "agents"), {
		recursive: true,
	});

	await snapshotStageCorpus(
		{ instructions: "instructions", skill: "build" },
		corpusSources(roots),
		secondSnapshot,
	);
	await installStageCorpusSnapshot(secondSnapshot, worktree, noCitations);

	expect(
		stat(join(worktree, ".claude", "agents", "reviewer.md")),
	).rejects.toThrow();
}

describe("frozen stage corpus installation", () => {
	it(
		"installs frozen skill bytes after their source changes",
		testInstallsFrozenSkillBytesAfterTheirSourceChanges,
	);
	it(
		"installs the frozen instructions as CLAUDE.md under the target's .claude directory",
		testInstallsTheFrozenInstructionsAsCLAUDEMdUnderTheTargetSClaudeDirectory,
	);
	it(
		"removes a prior stage's agents and output styles the next stage's snapshot does not carry",
		testRemovesAPriorStageSAgentsAndOutputStylesTheNextStageSSnapshotDoesNotCarry,
	);
});
