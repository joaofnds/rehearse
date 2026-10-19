import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCommand } from "./command";
import {
	addWorktree,
	changedPathsBetween,
	currentSha,
	pruneWorktrees,
	removeWorktree,
	snapshotCheckout,
} from "./target";
import TemporaryWorktreeBuilder from "./target-worktree-test-builder";
import { TestResources, commitAll } from "./test-support";

const testResources = TestResources.forEachTest();
const commitsTheCheckoutsUncommittedAndUntrackedFiles =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		await Bun.write(join(source.directory, "base.txt"), "changed\n");
		await Bun.write(join(source.directory, "GLOSSARY.md"), "# Glossary\n");

		const snapshot = await snapshotCheckout(source.directory, source.sha);

		expect(
			await changedPathsBetween(source.directory, source.sha, snapshot),
		).toEqual(["GLOSSARY.md", "base.txt"]);
	};

const leavesTheCheckoutAsItWas = async (): Promise<void> => {
	const source = await testResources.createRepository();
	await Bun.write(join(source.directory, "base.txt"), "changed\n");
	await Bun.write(join(source.directory, "GLOSSARY.md"), "# Glossary\n");
	const status = ["git", "status", "--porcelain", "--branch"];
	const before = await runCommand(status, source.directory);

	await snapshotCheckout(source.directory, source.sha);

	expect(await runCommand(status, source.directory)).toBe(before);
};

const takesHEADAndTheBaseAsParentsWhenTheStageRewrote =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		await runCommand(
			["git", "switch", "--orphan", "rewritten"],
			source.directory,
		);
		await Bun.write(join(source.directory, "rewritten.txt"), "rewritten\n");
		await commitAll(source.directory, "feat: rewrite history");
		const head = await currentSha(source.directory);

		const snapshot = await snapshotCheckout(source.directory, source.sha);

		const commit = await runCommand(
			["git", "rev-list", "--parents", "--max-count=1", snapshot],
			source.directory,
		);

		expect(commit.trim().split(" ")).toEqual([snapshot, head, source.sha]);
	};

const givesAReplayADetachedCheckoutWithoutTouchingThePrimary =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		const { worktree } = await new TemporaryWorktreeBuilder().build(
			testResources,
		);

		await addWorktree(source.directory, source.sha, worktree);

		expect(await Bun.file(join(worktree, "base.txt")).text()).toBe("base\n");
		const worktreeBranch = await runCommand(
			["git", "branch", "--show-current"],
			worktree,
		);
		expect(worktreeBranch.trim()).toBe("");
		const primaryBranch = await runCommand(
			["git", "branch", "--show-current"],
			source.directory,
		);
		expect(primaryBranch.trim()).toBe("main");

		await removeWorktree(source.directory, worktree);

		expect(await Bun.file(join(worktree, "base.txt")).exists()).toBe(false);
	};

const removesAWorktreeThatHoldsUncommittedReplayState =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		const { worktree } = await new TemporaryWorktreeBuilder().build(
			testResources,
		);

		await addWorktree(source.directory, source.sha, worktree);
		await Bun.write(join(worktree, "backlog", "task.md"), "workflow state\n");

		await removeWorktree(source.directory, worktree);

		expect(await Bun.file(join(worktree, "base.txt")).exists()).toBe(false);
	};

const forgetsAWorktreeWhoseDirectoryWasDeleted = async (): Promise<void> => {
	const source = await testResources.createRepository();
	const parent = await mkdtemp(join(tmpdir(), "rehearse-worktree-"));
	testResources.track(parent);
	const worktree = join(parent, "worktree");
	await addWorktree(source.directory, source.sha, worktree);
	await rm(parent, { force: true, recursive: true });

	await pruneWorktrees(source.directory);

	const listed = await runCommand(
		["git", "worktree", "list", "--porcelain"],
		source.directory,
	);

	expect(listed).not.toContain("rehearse-worktree-");
};
describe(snapshotCheckout.name, () => {
	it(
		"commits the checkout's uncommitted and untracked files",
		commitsTheCheckoutsUncommittedAndUntrackedFiles,
	);

	it("leaves the checkout as it was", leavesTheCheckoutAsItWas);

	it(
		"takes HEAD and the base as parents when the stage rewrote the history below the base",
		takesHEADAndTheBaseAsParentsWhenTheStageRewrote,
	);
});
describe(addWorktree.name, () => {
	it(
		"gives a replay a detached checkout without touching the primary",
		givesAReplayADetachedCheckoutWithoutTouchingThePrimary,
	);

	it(
		"removes a worktree that holds uncommitted replay state",
		removesAWorktreeThatHoldsUncommittedReplayState,
	);
});
describe(pruneWorktrees.name, () => {
	it(
		"forgets a worktree whose directory was deleted",
		forgetsAWorktreeWhoseDirectoryWasDeleted,
	);
});
