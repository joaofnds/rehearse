import { describe, expect, it } from "bun:test";
import { chmod, mkdir, mkdtemp, readdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runCommand } from "./command";
import { pathExists } from "./file-presence";
import { failureOf } from "#cli/cli-test-support";
import { recordRetentionRef } from "./target";
import {
	CommitsNotCopiedError,
	cloneTarget,
	releaseClone,
	retainInTarget,
} from "./target-clone";
import { TestResources, commitAll } from "./test-support";

const testResources = TestResources.forEachTest();
const TARGET_ORIGIN = "https://example.com/target.git";

describe(cloneTarget.name, () => {
	it("checks out the target's main while another branch is checked out", async () => {
		const origin = await testResources.createRepository();
		await runCommand(["git", "switch", "-c", "feature"], origin.directory);
		await Bun.write(join(origin.directory, "feature.txt"), "feature\n");
		await commitAll(origin.directory, "feat: feature");

		const clone = await cloneTarget(origin.directory);
		testResources.track(dirname(clone));

		const head = await runCommand(["git", "rev-parse", "HEAD"], clone);
		const branch = await runCommand(["git", "branch", "--show-current"], clone);
		expect({ head: head.trim(), branch: branch.trim() }).toEqual({
			head: origin.sha,
			branch: "main",
		});
	});

	it("gives the clone the target's origin", async () => {
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
	});

	it("leaves the clone no origin when the target has none", async () => {
		const target = await testResources.createRepository();

		const clone = await cloneTarget(target.directory);
		testResources.track(dirname(clone));

		expect(await runCommand(["git", "remote"], clone)).toBe("");
	});

	it("leaves the target's objects intact when the clone's are overwritten", async () => {
		const target = await testResources.createRepository();
		const object = join(
			".git",
			"objects",
			target.sha.slice(0, 2),
			target.sha.slice(2),
		);
		const original = await Bun.file(join(target.directory, object)).bytes();
		const clone = await cloneTarget(target.directory);
		testResources.track(dirname(clone));

		await chmod(join(clone, object), 0o644);
		await Bun.write(join(clone, object), "overwritten");

		const current = await Bun.file(join(target.directory, object)).bytes();
		expect(current).toEqual(original);
	});

	it("leaves out the target's untracked entries, such as a linked board", async () => {
		const origin = await testResources.createRepository();
		const board = await mkdtemp(join(tmpdir(), "rehearse-board-"));
		testResources.track(board);
		await symlink(board, join(origin.directory, "backlog"));
		await mkdir(join(origin.directory, "node_modules"));

		const clone = await cloneTarget(origin.directory);
		testResources.track(dirname(clone));

		const entries = await readdir(clone);
		expect(entries.toSorted()).toEqual([
			".git",
			".gitignore",
			"base.txt",
			"bun.lock",
			"package.json",
		]);
	});
});

describe(retainInTarget.name, () => {
	it("copies the run's retention ref and the commit it keeps into the target", async () => {
		const target = await testResources.createRepository();
		const clone = await testResources.createRepository();
		await Bun.write(join(clone.directory, "candidate.txt"), "candidate\n");
		await commitAll(clone.directory, "feat: candidate");
		const candidate = await retainedCommitAfter(clone.directory, "run-1");

		await retainInTarget(clone.directory, target.directory, "run-1");

		expect(await retainedCommit(target.directory, "run-1")).toBe(candidate);
	});

	it("copies nothing when the clone retained nothing for the run", async () => {
		const target = await testResources.createRepository();
		const clone = await testResources.createRepository();

		await retainInTarget(clone.directory, target.directory, "run-1");

		const refs = await runCommand(
			["git", "for-each-ref", "refs/rehearse"],
			target.directory,
		);
		expect(refs).toBe("");
	});
});

describe(releaseClone.name, () => {
	it("removes the clone once the target holds the run's commits", async () => {
		const target = await testResources.createRepository();
		const clone = await cloneTarget(target.directory);
		testResources.track(dirname(clone));
		await retainedCommitAfter(clone, "run-1");

		await releaseClone(clone, target.directory, "run-1");

		expect(await pathExists(dirname(clone))).toBe(false);
	});

	describe("when the target cannot take the run's commits", () => {
		it("refuses, naming the clone it keeps", async () => {
			const target = await testResources.createRepository();
			const clone = await cloneTarget(target.directory);
			testResources.track(dirname(clone));
			await retainedCommitAfter(clone, "run-1");
			const missingTarget = join(dirname(clone), "moved-away");

			const failure = await failureOf(
				releaseClone(clone, missingTarget, "run-1"),
			);

			expect(failure).toBeInstanceOf(CommitsNotCopiedError);
		});

		it("keeps the clone, which holds their only copy", async () => {
			const target = await testResources.createRepository();
			const clone = await cloneTarget(target.directory);
			testResources.track(dirname(clone));
			await retainedCommitAfter(clone, "run-1");
			const missingTarget = join(dirname(clone), "moved-away");

			await failureOf(releaseClone(clone, missingTarget, "run-1"));

			expect(await pathExists(clone)).toBe(true);
		});
	});

	describe("when the clone cannot be removed", () => {
		it("reports the removal, with the commits already in the target", async () => {
			const target = await testResources.createRepository();
			const clone = await cloneTarget(target.directory);
			testResources.track(dirname(clone));
			const candidate = await retainedCommitAfter(clone, "run-1");
			await chmod(dirname(clone), 0o500);

			const failure = await failureOf(
				releaseClone(clone, target.directory, "run-1"),
			);
			await chmod(dirname(clone), 0o700);

			expect(failure).toBeInstanceOf(Error);
			expect(failure).not.toBeInstanceOf(CommitsNotCopiedError);
			expect(await retainedCommit(target.directory, "run-1")).toBe(candidate);
		});
	});
});

async function retainedCommit(
	repository: string,
	runName: string,
): Promise<string> {
	const output = await runCommand(
		[
			"git",
			"rev-parse",
			"--verify",
			"--quiet",
			`refs/rehearse/${runName}^{commit}`,
		],
		repository,
	);

	return output.trim();
}

async function retainedCommitAfter(
	repository: string,
	runName: string,
): Promise<string> {
	const output = await runCommand(["git", "rev-parse", "HEAD"], repository);
	const head = output.trim();
	await recordRetentionRef(repository, runName, head);

	return head;
}
