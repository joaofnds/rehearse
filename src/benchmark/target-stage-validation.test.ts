import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCommand } from "./command";
import { StageValidationError } from "./contracts";
import {
	addWorktree,
	assertWorkspaceCleanAt,
	capturePlanningAdvance,
	currentSha,
} from "./target";
import TemporaryWorktreeBuilder from "./target-worktree-test-builder";
import { TestResources, commitAll } from "./test-support";

const testResources = TestResources.forEachTest();
const capturesCommitsAPlanningStageAddedOnTheBaseline =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		await Bun.write(join(source.directory, "GLOSSARY.md"), "audit log\n");
		await commitAll(source.directory, "add project glossary");
		const head = await runCommand(
			["git", "rev-parse", "HEAD"],
			source.directory,
		);

		const advance = await capturePlanningAdvance(source.directory, source.sha);

		expect(advance.resultSha).toBe(head.trim());
		expect(advance.changedPaths).toEqual(["GLOSSARY.md"]);
		expect(advance.diff).toContain("audit log");
		expect(advance.commitSubjects).toEqual(["add project glossary"]);
	};
const capturesAnEmptyAdvanceWhenTheStageCommittedNothing =
	async (): Promise<void> => {
		const source = await testResources.createRepository();

		const advance = await capturePlanningAdvance(source.directory, source.sha);

		expect(advance).toEqual({
			changedPaths: [],
			diff: "",
			resultSha: source.sha,
		});
	};
const rejectsAStageThatRewroteTheBaselineHistory = async (): Promise<void> => {
	const source = await testResources.createRepository();
	await runCommand(
		["git", "commit", "--amend", "--no-edit", "-m", "chore: rewritten"],
		source.directory,
	);

	expect(capturePlanningAdvance(source.directory, source.sha)).rejects.toThrow(
		"rewrote or discarded task history",
	);
};
const namesThePathsAStageLeftUncommitted = async (): Promise<void> => {
	const source = await testResources.createRepository();
	await Bun.write(join(source.directory, "stray.md"), "uncommitted\n");
	await Bun.write(join(source.directory, "GLOSSARY.md"), "audit log\n");

	expect(capturePlanningAdvance(source.directory, source.sha)).rejects.toThrow(
		"Target worktree is dirty: ?? GLOSSARY.md, ?? stray.md",
	);
};
const namesTheBranchAStageLeftTheBaselineFor = async (): Promise<void> => {
	const source = await testResources.createRepository();
	await runCommand(["git", "switch", "-c", "stray"], source.directory);

	expect(capturePlanningAdvance(source.directory, source.sha)).rejects.toThrow(
		"Target is on branch stray, expected main",
	);
};
const acceptsACleanDetachedWorktreeWhenNoBranchIsExpected =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		const { worktree } = await new TemporaryWorktreeBuilder().build(
			testResources,
		);
		await addWorktree(source.directory, source.sha, worktree);

		expect(
			assertWorkspaceCleanAt(worktree, source.sha, null),
		).resolves.toBeUndefined();
		expect(assertWorkspaceCleanAt(worktree, source.sha)).rejects.toBeInstanceOf(
			StageValidationError,
		);
	};
const rejectsAWorkspaceThatLeftItsDetachedCheckoutForABranch =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		const { worktree } = await new TemporaryWorktreeBuilder().build(
			testResources,
		);
		await addWorktree(source.directory, source.sha, worktree);
		await runCommand(["git", "switch", "-c", "stray"], worktree);

		expect(
			assertWorkspaceCleanAt(worktree, source.sha, null),
		).rejects.toBeInstanceOf(StageValidationError);
	};
const namesTheBranchAWorkspaceLeftItsDetachedCheckoutFor =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		const { worktree } = await new TemporaryWorktreeBuilder().build(
			testResources,
		);
		await addWorktree(source.directory, source.sha, worktree);
		await runCommand(["git", "switch", "-c", "stray"], worktree);

		expect(assertWorkspaceCleanAt(worktree, source.sha, null)).rejects.toThrow(
			"Target is on branch stray, expected a detached checkout",
		);
	};
const namesTheCommitAWorkspaceMovedTo = async (): Promise<void> => {
	const source = await testResources.createRepository();
	const parent = await mkdtemp(join(tmpdir(), "rehearse-worktree-"));
	testResources.track(parent);
	const worktree = join(parent, "worktree");
	await addWorktree(source.directory, source.sha, worktree);
	await Bun.write(join(worktree, "extra.md"), "added\n");
	await commitAll(worktree, "chore: move ahead");
	const moved = await currentSha(worktree);

	expect(assertWorkspaceCleanAt(worktree, source.sha, null)).rejects.toThrow(
		`Target is at commit ${moved}, expected ${source.sha}`,
	);
};
const namesThePathsAWorkspaceLeftUncommitted = async (): Promise<void> => {
	const source = await testResources.createRepository();
	const parent = await mkdtemp(join(tmpdir(), "rehearse-worktree-"));
	testResources.track(parent);
	const worktree = join(parent, "worktree");
	await addWorktree(source.directory, source.sha, worktree);
	await Bun.write(join(worktree, "stray.md"), "uncommitted\n");

	expect(assertWorkspaceCleanAt(worktree, source.sha, null)).rejects.toThrow(
		"Target worktree is dirty: ?? stray.md",
	);
};
describe(capturePlanningAdvance.name, () => {
	it(
		"captures commits a planning stage added on the baseline",
		capturesCommitsAPlanningStageAddedOnTheBaseline,
	);

	it(
		"captures an empty advance when the stage committed nothing",
		capturesAnEmptyAdvanceWhenTheStageCommittedNothing,
	);

	it(
		"rejects a stage that rewrote the baseline history",
		rejectsAStageThatRewroteTheBaselineHistory,
	);

	it(
		"names the paths a stage left uncommitted",
		namesThePathsAStageLeftUncommitted,
	);

	it(
		"names the branch a stage left the baseline for",
		namesTheBranchAStageLeftTheBaselineFor,
	);
});
describe(assertWorkspaceCleanAt.name, () => {
	it(
		"accepts a clean detached worktree when no branch is expected",
		acceptsACleanDetachedWorktreeWhenNoBranchIsExpected,
	);

	it(
		"rejects a workspace that left its detached checkout for a branch",
		rejectsAWorkspaceThatLeftItsDetachedCheckoutForABranch,
	);

	it(
		"names the branch a workspace left its detached checkout for",
		namesTheBranchAWorkspaceLeftItsDetachedCheckoutFor,
	);

	it("names the commit a workspace moved to", namesTheCommitAWorkspaceMovedTo);

	it(
		"names the paths a workspace left uncommitted",
		namesThePathsAWorkspaceLeftUncommitted,
	);
});
