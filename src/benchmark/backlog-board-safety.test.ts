import { describe, expect, it } from "bun:test";
import { mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";

import { seedTaskBoard } from "./backlog";
import {
	createBacklogTarget,
	BACKLOG_TASK_SEED as seed,
} from "./backlog-test-support";
import { runCommand } from "./command";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

async function refusesOutsideBoard(): Promise<void> {
	const target = await createBacklogTarget(testResources);
	await Bun.write(
		join(target.directory, "backlog.config.yml"),
		[
			'project_name: "Existing"',
			'default_status: "To Do"',
			'statuses: ["To Do", "Done"]',
			'backlog_directory: "../outside"',
			"",
		].join("\n"),
	);

	expect(
		seedTaskBoard(target.directory, seed, ["To Do", "Done"]),
	).rejects.toThrow("must stay inside the target repository");
}

async function keepsExcludesOnMalformedConfiguration(): Promise<void> {
	const target = await createBacklogTarget(testResources);
	const excludePath = join(target.directory, ".git", "info", "exclude");
	const originalExcludes = await Bun.file(excludePath).text();
	await Bun.write(
		join(target.directory, "backlog.config.yml"),
		"statuses: [unterminated\n",
	);

	expect(
		seedTaskBoard(target.directory, seed, ["To Do", "Done"]),
	).rejects.toThrow("Invalid Backlog configuration:");
	expect(await Bun.file(excludePath).text()).toBe(originalExcludes);
}

async function refusesLinkedConfiguration(): Promise<void> {
	const target = await createBacklogTarget(testResources);
	const outside = join(target.directory, "outside.yml");
	const original = ['project_name: "Outside"', 'statuses: ["To Do"]', ""].join(
		"\n",
	);
	await Bun.write(outside, original);
	await symlink(outside, join(target.directory, "backlog.config.yml"));

	expect(
		seedTaskBoard(target.directory, seed, ["To Do", "Done"]),
	).rejects.toThrow("is a link");
	expect(await Bun.file(outside).text()).toBe(original);
}

async function refusesLinkedBoardParent(): Promise<void> {
	const target = await createBacklogTarget(testResources);
	await mkdir(join(target.directory, "actual"));
	await symlink(
		join(target.directory, "actual"),
		join(target.directory, "linked"),
	);
	await Bun.write(
		join(target.directory, "backlog.config.yml"),
		[
			'project_name: "Existing"',
			'statuses: ["To Do", "Done"]',
			'backlog_directory: "linked/board"',
			"",
		].join("\n"),
	);

	expect(
		seedTaskBoard(target.directory, seed, ["To Do", "Done"]),
	).rejects.toThrow("contains a link");
}

async function refusesGitAdministrationBoard(): Promise<void> {
	const target = await createBacklogTarget(testResources);
	await Bun.write(
		join(target.directory, "backlog.config.yml"),
		[
			'project_name: "Existing"',
			'statuses: ["To Do", "Done"]',
			'backlog_directory: ".git"',
			"",
		].join("\n"),
	);

	expect(
		seedTaskBoard(target.directory, seed, ["To Do", "Done"]),
	).rejects.toThrow("must not use Git administrative state");
}

async function refusesTrackedSourceBoard(): Promise<void> {
	const target = await createBacklogTarget(testResources);
	await mkdir(join(target.directory, "src"));
	await Bun.write(join(target.directory, "src", "app.ts"), "source\n");
	await Bun.write(
		join(target.directory, "backlog.config.yml"),
		[
			'project_name: "Existing"',
			'statuses: ["To Do", "Done"]',
			'backlog_directory: "src"',
			"",
		].join("\n"),
	);
	await runCommand(["git", "add", "src/app.ts"], target.directory);
	await runCommand(
		["git", "commit", "-m", "feat: add source"],
		target.directory,
	);

	expect(
		seedTaskBoard(target.directory, seed, ["To Do", "Done"]),
	).rejects.toThrow("must not contain tracked files: src/app.ts");
	expect(await Bun.file(join(target.directory, "src", "app.ts")).text()).toBe(
		"source\n",
	);
}

describe(seedTaskBoard.name, () => {
	it("refuses a configured board path outside the target", refusesOutsideBoard);
	it(
		"translates malformed configuration before changing private excludes",
		keepsExcludesOnMalformedConfiguration,
	);
	it(
		"refuses a linked root configuration without changing its target",
		refusesLinkedConfiguration,
	);
	it(
		"refuses a custom board beneath a linked directory",
		refusesLinkedBoardParent,
	);
	it(
		"refuses Git administrative state as the board directory",
		refusesGitAdministrationBoard,
	);
	it(
		"refuses a board directory that contains tracked source",
		refusesTrackedSourceBoard,
	);
});
