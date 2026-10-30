import { describe, expect, it } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import {
	captureStageCorpus,
	installStageCorpusSnapshot,
	snapshotStageCorpus,
} from "./checkpoint";
import {
	corpusRoots,
	corpusSources,
	installSkill,
} from "./checkpoint-corpus-test-fixture";
import {
	noCitations,
	temporaryDirectory,
} from "./checkpoint-filesystem-test-fixture";
import { runCommand } from "./command";
import { CorpusFileError } from "./corpus-file";
import { TestResources, commitAll } from "./test-support";

const HOME_CORPUS_ROOT_INDEX = 1;

async function worktreeStatus(worktree: string): Promise<string> {
	return await runCommand(
		["git", "status", "--porcelain=v1", "--untracked-files=all"],
		worktree,
	);
}

const testResources = TestResources.forEachTest();

async function linkedWorktree(): Promise<{
	readonly repository: string;
	readonly worktree: string;
}> {
	const repository = await testResources.createRepository();
	await Bun.write(join(repository.directory, ".gitignore"), "node_modules/\n");
	await commitAll(repository.directory, "chore: drop workflow ignores");
	const parent = await temporaryDirectory(
		testResources,
		"rehearse-corpus-ignore-",
	);
	const worktree = join(parent, "worktree");
	await runCommand(
		["git", "worktree", "add", "--detach", worktree, "HEAD"],
		repository.directory,
	);
	testResources.trackWorktree(repository.directory, worktree);

	return { repository: repository.directory, worktree };
}

interface SnapshotInput {
	readonly skill: string;
	readonly body: string;
}

async function snapshotOf({ skill, body }: SnapshotInput): Promise<string> {
	const roots = await corpusRoots(testResources);
	await installSkill({
		body: "doctrine skill",
		root: roots[HOME_CORPUS_ROOT_INDEX],
		skill: "doctrine",
	});
	await installSkill({
		body,
		root: roots[HOME_CORPUS_ROOT_INDEX],
		skill,
	});
	const parent = await temporaryDirectory(
		testResources,
		"rehearse-corpus-snapshot-",
	);
	const snapshotDirectory = join(parent, "snapshot");

	await snapshotStageCorpus(
		{ instructions: "frozen instructions", skill },
		corpusSources(roots),
		snapshotDirectory,
	);

	return snapshotDirectory;
}

async function testLeavesTheTargetSStatusClean(): Promise<void> {
	const { worktree } = await linkedWorktree();

	await installStageCorpusSnapshot(
		await snapshotOf({ body: "discuss skill", skill: "discuss" }),
		worktree,
		noCitations,
	);

	expect(await worktreeStatus(worktree)).toBe("");
}

async function testStillReportsAFileAStageWritesBesideTheInstalledCorpus(): Promise<void> {
	const { worktree } = await linkedWorktree();

	await installStageCorpusSnapshot(
		await snapshotOf({ body: "discuss skill", skill: "discuss" }),
		worktree,
		noCitations,
	);

	await writeFile(join(worktree, ".claude", "settings.json"), "{}");

	expect(await worktreeStatus(worktree)).toBe("?? .claude/settings.json\n");
}

async function testStillReportsASkillAStageWritesIntoTheInstalledLayout(): Promise<void> {
	const { worktree } = await linkedWorktree();

	await installStageCorpusSnapshot(
		await snapshotOf({ body: "discuss skill", skill: "discuss" }),
		worktree,
		noCitations,
	);

	await mkdir(join(worktree, ".claude", "skills", "authored"));
	await writeFile(
		join(worktree, ".claude", "skills", "authored", "SKILL.md"),
		"authored",
	);

	expect(await worktreeStatus(worktree)).toBe(
		"?? .claude/skills/authored/SKILL.md\n",
	);
}

async function testMatchesAnInstalledFileNameLiterally(): Promise<void> {
	const { worktree } = await linkedWorktree();

	await installStageCorpusSnapshot(
		await snapshotOf({ body: "glob skill", skill: "glob[a]*" }),
		worktree,
		noCitations,
	);

	await mkdir(join(worktree, ".claude", "skills", "globa-b"));
	await writeFile(
		join(worktree, ".claude", "skills", "globa-b", "SKILL.md"),
		"authored",
	);

	expect(await worktreeStatus(worktree)).toBe(
		"?? .claude/skills/globa-b/SKILL.md\n",
	);
}

async function testStaysCleanAfterALaterStageInstallsADifferentCorpus(): Promise<void> {
	const { worktree } = await linkedWorktree();

	await installStageCorpusSnapshot(
		await snapshotOf({ body: "discuss skill", skill: "discuss" }),
		worktree,
		noCitations,
	);

	await installStageCorpusSnapshot(
		await snapshotOf({ body: "shape skill", skill: "shape" }),
		worktree,
		noCitations,
	);

	expect(await worktreeStatus(worktree)).toBe("");
}

async function testRefusesACorpusFileWhoseNameTheIgnoreFileCannotHold(): Promise<void> {
	const { worktree } = await linkedWorktree();
	const snapshot = await snapshotOf({
		body: "discuss skill",
		skill: "discuss",
	});
	await writeFile(join(snapshot, "skills", "discuss", "two\nlines.md"), "");

	const failure = await failureOf(
		installStageCorpusSnapshot(snapshot, worktree, noCitations),
	);

	expect(failure).toBeInstanceOf(CorpusFileError);
}

async function testLeavesTheRepositorySSharedExcludesUntouched(): Promise<void> {
	const { repository, worktree } = await linkedWorktree();
	const exclude = join(repository, ".git", "info", "exclude");
	const before = await Bun.file(exclude).text();

	await installStageCorpusSnapshot(
		await snapshotOf({ body: "discuss skill", skill: "discuss" }),
		worktree,
		noCitations,
	);

	expect(await Bun.file(exclude).text()).toBe(before);
}

describe(captureStageCorpus.name, () => {
	describe("when the target does not ignore .claude", () => {
		it("leaves the target's status clean", testLeavesTheTargetSStatusClean);
		it(
			"still reports a file a stage writes beside the installed corpus",
			testStillReportsAFileAStageWritesBesideTheInstalledCorpus,
		);
		it(
			"still reports a skill a stage writes into the installed layout",
			testStillReportsASkillAStageWritesIntoTheInstalledLayout,
		);
		it(
			"matches an installed file name literally",
			testMatchesAnInstalledFileNameLiterally,
		);
		it(
			"stays clean after a later stage installs a different corpus",
			testStaysCleanAfterALaterStageInstallsADifferentCorpus,
		);
		it(
			"refuses a corpus file whose name the ignore file cannot hold",
			testRefusesACorpusFileWhoseNameTheIgnoreFileCannotHold,
		);
		it(
			"leaves the repository's shared excludes untouched",
			testLeavesTheRepositorySSharedExcludesUntouched,
		);
	});
});
