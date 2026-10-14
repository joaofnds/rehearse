import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runCommand } from "./command";
import { recordRetentionRef } from "./target";
import { cloneTarget, retainInTarget } from "./target-clone";
import { TestResources, commitAll } from "./test-support";

const testResources = TestResources.forEachTest();

describe(cloneTarget.name, () => {
	it("checks out the target's main at its commit", async () => {
		const origin = await testResources.createRepository();

		const clone = await cloneTarget(origin.directory);
		testResources.track(dirname(clone));

		const head = await runCommand(["git", "rev-parse", "HEAD"], clone);
		const branch = await runCommand(["git", "branch", "--show-current"], clone);
		expect({ head: head.trim(), branch: branch.trim() }).toEqual({
			head: origin.sha,
			branch: "main",
		});
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

async function retainedCommitAfter(
	repository: string,
	runName: string,
): Promise<string> {
	const output = await runCommand(["git", "rev-parse", "HEAD"], repository);
	const head = output.trim();
	await recordRetentionRef(repository, runName, head);

	return head;
}
