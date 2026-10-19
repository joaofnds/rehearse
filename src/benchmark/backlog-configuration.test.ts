import { describe, expect, it } from "bun:test";
import { mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import { seedTaskBoard } from "./backlog";
import {
	createBacklogTarget,
	BACKLOG_TASK_SEED as seed,
} from "./backlog-test-support";
import { runCommand } from "./command";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

async function preservesCustomConfiguration(): Promise<void> {
	const expectedReaddirCount = 1;

	const target = await createBacklogTarget(testResources);
	await Bun.write(
		join(target.directory, "backlog.config.yml"),
		[
			'project_name: "Existing"',
			'default_status: "To Do"',
			'statuses: ["To Do"]',
			'task_prefix: "work"',
			'backlog_directory: "workflow-board"',
			"",
		].join("\n"),
	);

	await seedTaskBoard(target.directory, seed, ["To Do", "Done"]);

	expect(
		await readdir(join(target.directory, "workflow-board", "tasks")),
	).toHaveLength(expectedReaddirCount);
	const backlogConfiguration = Bun.YAML.parse(
		await Bun.file(join(target.directory, "backlog.config.yml")).text(),
	);
	expect(backlogConfiguration).toMatchObject({
		statuses: ["To Do", "Done"],
		task_prefix: "work",
	});
	expect(
		await runCommand(
			["git", "status", "--porcelain", "--untracked-files=all"],
			target.directory,
		),
	).toBe("");
}

async function refusesTrackedStatusChanges(): Promise<void> {
	const target = await createBacklogTarget(testResources);
	const configPath = join(target.directory, "backlog.config.yml");
	const original = [
		'project_name: "Existing"',
		'default_status: "To Do"',
		'statuses: ["To Do"]',
		"task_prefix: work",
		'backlog_directory: "workflow-board"',
		"",
	].join("\n");
	await Bun.write(configPath, original);
	await runCommand(["git", "add", "backlog.config.yml"], target.directory);
	await runCommand(
		["git", "commit", "-m", "chore: configure backlog"],
		target.directory,
	);

	expect(
		seedTaskBoard(target.directory, seed, ["To Do", "Done"]),
	).rejects.toThrow("must already declare the pipeline statuses");
	expect(await Bun.file(configPath).text()).toBe(original);
	expect(stat(join(target.directory, "workflow-board"))).rejects.toMatchObject({
		code: "ENOENT",
	});
}

async function preservesNormalizedTrackedBytes(): Promise<void> {
	const target = await createBacklogTarget(testResources);
	const configPath = join(target.directory, "backlog.config.yml");
	await runCommand(
		[
			"backlog",
			"init",
			"Existing",
			"--defaults",
			"--integration-mode",
			"cli",
			"--agent-instructions",
			"none",
			"--backlog-dir",
			"workflow-board",
			"--config-location",
			"root",
			"--no-git",
		],
		target.directory,
	);
	const original = await Bun.file(configPath).text();
	await runCommand(["git", "add", "backlog.config.yml"], target.directory);
	await runCommand(
		["git", "commit", "-m", "chore: configure backlog"],
		target.directory,
	);

	await seedTaskBoard(target.directory, seed, ["To Do", "In Progress", "Done"]);

	expect(await Bun.file(configPath).text()).toBe(original);
	expect(
		await runCommand(
			["git", "status", "--porcelain", "--untracked-files=all"],
			target.directory,
		),
	).toBe("");
}

async function refusesTrackedNormalization(): Promise<void> {
	const target = await createBacklogTarget(testResources);
	const configPath = join(target.directory, "backlog", "config.yml");
	const original = [
		"project_name: Existing",
		"default_status: To Do",
		"statuses: [To Do, Done]",
		"task_prefix: work",
		"",
	].join("\n");
	await mkdir(join(target.directory, "backlog"));
	await Bun.write(configPath, original);
	await runCommand(
		["git", "add", "-f", "backlog/config.yml"],
		target.directory,
	);
	await runCommand(
		["git", "commit", "-m", "chore: configure backlog"],
		target.directory,
	);

	expect(
		seedTaskBoard(target.directory, seed, ["To Do", "Done"]),
	).rejects.toThrow("must already be normalized by the pinned Backlog CLI");
	expect(await Bun.file(configPath).text()).toBe(original);
	expect(
		await runCommand(
			["git", "status", "--porcelain", "--untracked-files=all"],
			target.directory,
		),
	).toBe("");
}

async function updatesBlockListStatuses(): Promise<void> {
	const expectedReaddirCount = 1;

	const target = await createBacklogTarget(testResources);
	await mkdir(join(target.directory, ".backlog"));
	await Bun.write(
		join(target.directory, ".backlog", "config.yml"),
		[
			'project_name: "Existing"',
			'default_status: "To Do"',
			"statuses:",
			"  - To Do",
			"task_prefix: work",
			"",
		].join("\n"),
	);

	await seedTaskBoard(target.directory, seed, ["To Do", "Done"]);

	const backlogConfiguration = Bun.YAML.parse(
		await Bun.file(join(target.directory, ".backlog", "config.yml")).text(),
	);
	expect(backlogConfiguration).toMatchObject({ statuses: ["To Do", "Done"] });
	expect(
		await readdir(join(target.directory, ".backlog", "tasks")),
	).toHaveLength(expectedReaddirCount);
}

async function usesHiddenFolderBoard(): Promise<void> {
	const expectedReaddirCount = 1;

	const target = await createBacklogTarget(testResources);
	await mkdir(join(target.directory, ".backlog"));
	await Bun.write(
		join(target.directory, ".backlog", "config.yml"),
		[
			'project_name: "Existing"',
			'default_status: "To Do"',
			'statuses: ["To Do"]',
			"",
		].join("\n"),
	);

	await seedTaskBoard(target.directory, seed, ["To Do", "Done"]);

	expect(
		await readdir(join(target.directory, ".backlog", "tasks")),
	).toHaveLength(expectedReaddirCount);
	expect(
		await Bun.file(join(target.directory, "backlog.config.yml")).exists(),
	).toBe(false);
}

describe(seedTaskBoard.name, () => {
	it(
		"preserves an existing custom board configuration",
		preservesCustomConfiguration,
	);
	it(
		"refuses to rewrite statuses in a tracked configuration",
		refusesTrackedStatusChanges,
	);
	it(
		"keeps a compatible tracked configuration byte-for-byte",
		preservesNormalizedTrackedBytes,
	);
	it(
		"refuses a tracked configuration the pinned CLI would normalize",
		refusesTrackedNormalization,
	);
	it(
		"updates a block-list status configuration without leaving invalid YAML",
		updatesBlockListStatuses,
	);
	it(
		"uses an existing hidden-folder board configuration",
		usesHiddenFolderBoard,
	);
});
