import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import {
	assertPlanningStageCompleted,
	readTaskCard,
	seedTaskBoard,
} from "./backlog";
import {
	createBacklogTarget,
	BACKLOG_TASK_SEED as seed,
} from "./backlog-test-support";
import { runCommand } from "./command";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

async function leavesProjectInstructionsAbsent(): Promise<void> {
	const target = await createBacklogTarget(testResources);

	await seedTaskBoard(target.directory, seed, ["To Do", "Done"]);

	expect(await Bun.file(join(target.directory, "CLAUDE.md")).exists()).toBe(
		false,
	);
}

async function keepsTheOriginalHead(): Promise<void> {
	const target = await createBacklogTarget(testResources);

	const { taskSha } = await seedTaskBoard(target.directory, seed, [
		"To Do",
		"Done",
	]);

	const subjects = await runCommand(
		["git", "log", "--format=%s"],
		target.directory,
	);
	expect(subjects).not.toContain("chore: configure project instructions");
	expect(taskSha).toBe(target.sha);
}

async function initializesPrivateBoard(): Promise<void> {
	const expectedReaddirCount = 1;

	const target = await createBacklogTarget(testResources);

	await seedTaskBoard(target.directory, seed, ["To Do", "Done"]);

	expect(
		await readdir(join(target.directory, "backlog", "tasks")),
	).toHaveLength(expectedReaddirCount);
	const backlogConfiguration = Bun.YAML.parse(
		await Bun.file(join(target.directory, "backlog", "config.yml")).text(),
	);
	expect(backlogConfiguration).toMatchObject({ statuses: ["To Do", "Done"] });
}

async function readsSeededCard(): Promise<void> {
	const target = await createBacklogTarget(testResources);

	const { taskId } = await seedTaskBoard(target.directory, seed, [
		"To Do",
		"Done",
	]);

	expect(await readTaskCard(target.directory, taskId)).toContain(
		"Add an audit log",
	);
}

async function completesWithoutArtifact(): Promise<void> {
	const target = await createBacklogTarget(testResources);
	const { taskId } = await seedTaskBoard(target.directory, seed, [
		"To Do",
		"Done",
	]);
	const view = { task: { acceptanceCriteria: [{}], documentation: [] } };
	const stage = {
		kind: "planning",
		name: "shape",
		requiresAcceptanceCriteria: false,
		rubric: "rubrics/shape.json",
		skill: "shape",
	} as const;

	const completed = await assertPlanningStageCompleted(
		{ baselineSha: target.sha, targetDir: target.directory },
		{ stage, taskState: { output: taskId, view } },
	);

	expect(completed.artifact).toBeUndefined();
}

describe(seedTaskBoard.name, () => {
	it("adds no CLAUDE.md to the target tree", leavesProjectInstructionsAbsent);
	it(
		"writes no instructions commit, leaving the base commit at HEAD",
		keepsTheOriginalHead,
	);
	it(
		"puts the board under ignored workflow state without a personal configuration",
		initializesPrivateBoard,
	);
	it("reads back a card from the board it seeded", readsSeededCard);
	it(
		"completes a planning stage that wrote no document",
		completesWithoutArtifact,
	);
});
