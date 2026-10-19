import { describe, expect, it } from "bun:test";
import { mkdir, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { seedTaskBoard } from "./backlog";
import {
	createBacklogTarget,
	createLinkedBacklogWorktree,
	removeBoardIgnores,
	BACKLOG_TASK_SEED as seed,
} from "./backlog-test-support";
import { runCommand } from "./command";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

async function escapesBoardPatternCharacters(): Promise<void> {
	const expectedReaddirCount = 1;

	const target = await createBacklogTarget(testResources);
	await Bun.write(
		join(target.directory, "backlog.config.yml"),
		[
			'project_name: "Existing"',
			'default_status: "To Do"',
			'statuses: ["To Do", "Done"]',
			'backlog_directory: "board*"',
			"",
		].join("\n"),
	);

	await seedTaskBoard(target.directory, seed, ["To Do", "Done"]);
	await mkdir(join(target.directory, "board-source"));
	await Bun.write(
		join(target.directory, "board-source", "payload.ts"),
		"product source\n",
	);

	expect(
		await runCommand(
			["git", "status", "--porcelain", "--untracked-files=all"],
			target.directory,
		),
	).toBe("?? board-source/payload.ts\n");
	expect(await readdir(join(target.directory, "board*", "tasks"))).toHaveLength(
		expectedReaddirCount,
	);
}

async function keepsPrivateExcludesRooted(): Promise<void> {
	const target = await createBacklogTarget(testResources);
	const existingExcludes = "# retain this spacing\n\n";
	await Bun.write(
		join(target.directory, ".git", "info", "exclude"),
		existingExcludes,
	);
	await removeBoardIgnores(target.directory);
	await seedTaskBoard(target.directory, seed, ["To Do", "Done"]);
	await mkdir(join(target.directory, "src", "backlog"), { recursive: true });
	await Bun.write(
		join(target.directory, "src", "backlog", "payload.ts"),
		"untracked payload\n",
	);
	expect(
		await Bun.file(join(target.directory, ".git", "info", "exclude")).text(),
	).toStartWith(existingExcludes);

	expect(
		await runCommand(
			["git", "status", "--porcelain", "--untracked-files=all"],
			target.directory,
		),
	).toBe("?? src/backlog/payload.ts\n");
}

async function excludesThroughCommonGitDirectory(): Promise<void> {
	const target = await createBacklogTarget(testResources);
	await removeBoardIgnores(target.directory);
	const worktree = await createLinkedBacklogWorktree(
		testResources,
		target.directory,
	);

	await seedTaskBoard(worktree, seed, ["To Do", "Done"]);

	const commonDirectory = await runCommand(
		["git", "rev-parse", "--git-common-dir"],
		worktree,
	);
	const exclude = await Bun.file(
		resolve(worktree, commonDirectory.trim(), "info", "exclude"),
	).text();
	expect(exclude).toContain("/backlog/");
	expect(
		await runCommand(
			["git", "status", "--porcelain", "--untracked-files=all"],
			worktree,
		),
	).toBe("");
}

describe(seedTaskBoard.name, () => {
	it(
		"escapes Git pattern characters in a custom board path",
		escapesBoardPatternCharacters,
	);
	it(
		"leaves a target that ignores no board path clean",
		keepsPrivateExcludesRooted,
	);
	it(
		"writes private excludes through a linked worktree's common Git directory",
		excludesThroughCommonGitDirectory,
	);
});
