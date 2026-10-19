import { describe, expect, it } from "bun:test";
import { chmod, readdir, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";

import { runCommand } from "./command";
import { cloneTarget } from "./target-clone";
import { TestResources, commitAll } from "./test-support";

const GIT_OBJECT_DIRECTORY_PREFIX_CHARACTERS = 2;

const PREFIX_START_INDEX = 0;

const READABLE_FILE_MODE = 0o644;

const testResources = TestResources.forEachTest();

const TARGET_ORIGIN = "https://example.com/target.git";

const cloneTargetChecksOutTheTargetsMainWhileAnotherBranchIsCheckedOut =
	async (): Promise<void> => {
		const origin = await testResources.createRepository();
		await runCommand(["git", "switch", "-c", "feature"], origin.directory);
		await Bun.write(join(origin.directory, "feature.txt"), "feature\n");
		await commitAll(origin.directory, "feat: feature");

		const clone = await cloneTarget(origin.directory);
		testResources.track(dirname(clone));

		const head = await runCommand(["git", "rev-parse", "HEAD"], clone);
		const branch = await runCommand(["git", "branch", "--show-current"], clone);

		expect({ branch: branch.trim(), head: head.trim() }).toEqual({
			branch: "main",
			head: origin.sha,
		});
	};

const cloneTargetGivesTheCloneTheTargetsOrigin = async (): Promise<void> => {
	const target = await testResources.createRepository();
	await runCommand(
		["git", "remote", "add", "origin", TARGET_ORIGIN],
		target.directory,
	);

	const clone = await cloneTarget(target.directory);
	testResources.track(dirname(clone));

	const origin = await runCommand(
		["git", "remote", "get-url", "origin"],
		clone,
	);

	expect(origin.trim()).toBe(TARGET_ORIGIN);
};

const cloneTargetLeavesTheCloneNoOriginWhenTheTargetHasNone =
	async (): Promise<void> => {
		const target = await testResources.createRepository();

		const clone = await cloneTarget(target.directory);
		testResources.track(dirname(clone));

		expect(await runCommand(["git", "remote"], clone)).toBe("");
	};

const cloneTargetLeavesTheTargetsObjectsIntactWhenTheClonesAreOverwritten =
	async (): Promise<void> => {
		const target = await testResources.createRepository();
		const object = join(
			".git",
			"objects",
			target.sha.slice(
				PREFIX_START_INDEX,
				GIT_OBJECT_DIRECTORY_PREFIX_CHARACTERS,
			),
			target.sha.slice(GIT_OBJECT_DIRECTORY_PREFIX_CHARACTERS),
		);
		const original = await Bun.file(join(target.directory, object)).bytes();

		const clone = await cloneTarget(target.directory);
		testResources.track(dirname(clone));

		await chmod(join(clone, object), READABLE_FILE_MODE);
		await Bun.write(join(clone, object), "overwritten");

		const current = await Bun.file(join(target.directory, object)).bytes();

		expect(current).toEqual(original);
	};

const cloneTargetLeavesOutTheTargetsUntrackedEntriesSuchAsALinkedBoard =
	async (): Promise<void> => {
		const origin = await testResources.createRepository();
		const board =
			await testResources.createTemporaryDirectory("rehearse-board-");
		await symlink(board, join(origin.directory, "backlog"));
		await Bun.write(
			join(origin.directory, "node_modules", "dep", "index.js"),
			"",
		);
		await Bun.write(join(origin.directory, "notes.txt"), "draft\n");

		const clone = await cloneTarget(origin.directory);
		testResources.track(dirname(clone));

		const tracked = await runCommand(
			["git", "ls-tree", "--name-only", "main"],
			origin.directory,
		);
		const entries = await readdir(clone);

		expect(entries.toSorted()).toEqual(
			[".git", ...tracked.trim().split("\n")].toSorted(),
		);
	};

describe(cloneTarget.name, () => {
	it(
		"checks out the target's main while another branch is checked out",
		cloneTargetChecksOutTheTargetsMainWhileAnotherBranchIsCheckedOut,
	);

	it(
		"gives the clone the target's origin",
		cloneTargetGivesTheCloneTheTargetsOrigin,
	);

	it(
		"leaves the clone no origin when the target has none",
		cloneTargetLeavesTheCloneNoOriginWhenTheTargetHasNone,
	);

	it(
		"leaves the target's objects intact when the clone's are overwritten",
		cloneTargetLeavesTheTargetsObjectsIntactWhenTheClonesAreOverwritten,
	);

	it(
		"leaves out the target's untracked entries, such as a linked board",
		cloneTargetLeavesOutTheTargetsUntrackedEntriesSuchAsALinkedBoard,
	);
});
