import { describe, expect, it } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { runCommand } from "#benchmark/command";
import { historyFixture, TestResources } from "#benchmark/test-support";
import {
	preserveStateEvidence,
	restoreStateEvidence,
} from "#benchmark/session-state-evidence";

const resources = TestResources.forEachTest();

/**
 * The digest covers every path and every byte under the saved tree, so a
 * grader that only changed a file's contents is as visible as one that added
 * or removed an entry.
 */
async function evidenceDigest(evidenceDirectory: string): Promise<string> {
	const hasher = new Bun.CryptoHasher("sha256");
	const entries = await readdir(evidenceDirectory, {
		recursive: true,
		withFileTypes: true,
	});

	for (const entry of entries.toSorted((left, right) =>
		join(left.parentPath, left.name).localeCompare(
			join(right.parentPath, right.name),
		),
	)) {
		const path = join(entry.parentPath, entry.name);
		hasher.update(relative(evidenceDirectory, path));
		if (entry.isFile()) {
			hasher.update(await Bun.file(path).arrayBuffer());
		}
	}

	return hasher.digest("hex");
}

async function directory(prefix: string): Promise<string> {
	const path = await mkdtemp(join(tmpdir(), prefix));
	resources.track(path);

	return path;
}

/**
 * A grade reads the tree a session left, which is the committed history plus
 * everything the session did to it that git has not recorded. The fixture
 * stands in for the seeded history and the writes below for the session.
 */
async function attemptWithHistory(): Promise<string> {
	const fixture = await historyFixture(["first", "second"]);
	resources.track(fixture.path);
	const attempt = await directory("rehearse-state-attempt-");
	await runCommand(["cp", "-R", `${fixture.path}/.`, attempt], attempt);
	await runCommand(["mv", "dot-git", ".git"], attempt);
	await runCommand(
		["mkdir", "-p", ".git/refs/heads", ".git/refs/tags"],
		attempt,
	);

	await Bun.write(join(attempt, "first.md"), "first, edited\n");
	await Bun.write(join(attempt, "untracked.txt"), "untracked\n");
	await Bun.write(join(attempt, ".gitignore"), "ignored/\n");
	await Bun.write(join(attempt, "ignored", "secret.txt"), "ignored\n");

	return attempt;
}

describe(restoreStateEvidence.name, () => {
	it("reproduces the working tree and the history the session left", async () => {
		const attempt = await attemptWithHistory();
		const before = {
			status: await runCommand(["git", "status", "--short"], attempt),
			log: await runCommand(["git", "log", "--format=%H"], attempt),
		};

		const evidence = await preserveStateEvidence(
			attempt,
			await directory("rehearse-state-record-"),
		);
		const restored = await restoreStateEvidence(
			evidence,
			await directory("rehearse-state-restore-"),
		);

		expect(await runCommand(["git", "status", "--short"], restored)).toBe(
			before.status,
		);
		expect(await runCommand(["git", "log", "--format=%H"], restored)).toBe(
			before.log,
		);
		expect(
			await Bun.file(join(restored, "ignored", "secret.txt")).exists(),
		).toBe(true);
	});

	it("leaves the evidence and the next restore untouched by what a grader wrote", async () => {
		const attempt = await attemptWithHistory();
		const evidence = await preserveStateEvidence(
			attempt,
			await directory("rehearse-state-record-"),
		);
		const before = await evidenceDigest(evidence);

		const grader = await restoreStateEvidence(
			evidence,
			await directory("rehearse-state-restore-"),
		);
		await rm(join(grader, "first.md"));
		await Bun.write(join(grader, "grader.txt"), "grader wrote this\n");
		await runCommand(["git", "add", "-A"], grader);
		await runCommand(
			[
				"git",
				"-c",
				"user.name=G",
				"-c",
				"user.email=g@e.invalid",
				"commit",
				"-m",
				"grader commit",
			],
			grader,
		);

		const second = await restoreStateEvidence(
			evidence,
			await directory("rehearse-state-restore-"),
		);

		expect(await evidenceDigest(evidence)).toBe(before);
		expect(await Bun.file(join(second, "first.md")).text()).toBe(
			"first, edited\n",
		);
		expect(await Bun.file(join(second, "grader.txt")).exists()).toBe(false);
	});
});
