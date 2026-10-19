import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { runCommand } from "./command";
import {
	assertSourceReady,
	assertWorkflowBoardPrivate,
	currentSha,
} from "./target";
import { TestResources, commitAll } from "./test-support";

const testResources = TestResources.forEachTest();
const readsTheCheckoutsHEAD = async (): Promise<void> => {
	const repository = await testResources.createRepository();

	expect(await currentSha(repository.directory)).toBe(repository.sha);
};

const reportsMainsCommitWhileAnotherBranchIsCheckedOut =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		await runCommand(["git", "switch", "-c", "feature"], source.directory);
		await Bun.write(join(source.directory, "feature.txt"), "feature\n");
		await commitAll(source.directory, "feat: feature");

		const baseline = await assertSourceReady(source.directory);

		expect(baseline.sha).toBe(source.sha);
	};

const acceptsACheckoutWithUncommittedAndUntrackedChanges =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		await Bun.write(join(source.directory, "base.txt"), "edited\n");
		await Bun.write(join(source.directory, "notes.txt"), "scratch\n");

		const baseline = await assertSourceReady(source.directory);

		expect(baseline.sha).toBe(source.sha);
	};

const rejectsARepositoryWithNoMainBranch = async (): Promise<void> => {
	const source = await testResources.createRepository();
	await runCommand(["git", "branch", "-m", "main", "trunk"], source.directory);

	expect(assertSourceReady(source.directory)).rejects.toThrow(
		"Target must have a main branch",
	);
};

const rejectsARepositorySubdirectory = async (): Promise<void> => {
	const source = await testResources.createRepository();
	const subdirectory = join(source.directory, "nested");
	await mkdir(subdirectory);

	expect(assertSourceReady(subdirectory)).rejects.toThrow(
		"Target must be the repository root",
	);
};

const refusesToTreatTrackedSourceAsWorkflowState = async (): Promise<void> => {
	const source = await testResources.createRepository();
	await mkdir(join(source.directory, "src"));
	await Bun.write(join(source.directory, "src", "app.ts"), "source\n");
	await Bun.write(
		join(source.directory, "backlog.config.yml"),
		'statuses: ["To Do", "Done"]\nbacklog_directory: "src"\n',
	);
	await runCommand(
		["git", "add", "src/app.ts", "backlog.config.yml"],
		source.directory,
	);
	await runCommand(
		["git", "commit", "-m", "chore: configure tracked board"],
		source.directory,
	);

	expect(assertWorkflowBoardPrivate(source.directory)).rejects.toThrow(
		"must not contain tracked files: src/app.ts",
	);
};
describe(currentSha.name, () => {
	it("reads the checkout's HEAD", readsTheCheckoutsHEAD);
});
describe(assertSourceReady.name, () => {
	it(
		"reports main's commit while another branch is checked out",
		reportsMainsCommitWhileAnotherBranchIsCheckedOut,
	);

	it(
		"accepts a checkout with uncommitted and untracked changes",
		acceptsACheckoutWithUncommittedAndUntrackedChanges,
	);

	it(
		"rejects a repository with no main branch",
		rejectsARepositoryWithNoMainBranch,
	);

	it("rejects a repository subdirectory", rejectsARepositorySubdirectory);
});
describe(assertWorkflowBoardPrivate.name, () => {
	it(
		"refuses to treat tracked source as workflow state",
		refusesToTreatTrackedSourceAsWorkflowState,
	);
});
