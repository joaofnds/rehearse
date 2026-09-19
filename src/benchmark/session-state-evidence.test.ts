import { describe, expect, it } from "bun:test";
import {
	appendFile,
	chmod,
	mkdir,
	mkdtemp,
	readdir,
	rm,
	symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { runCommand } from "#benchmark/command";
import { historyFixture, TestResources } from "#benchmark/test-support";
import {
	preserveStateEvidence,
	restoreStateEvidence,
	runAgainstStateEvidence,
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

/**
 * A recursive copy preserves a symlink, so a link the session planted would
 * reach the operator's files from inside the saved evidence and from every
 * restore made out of it. Seeding refuses one on the way in for the same
 * reason; retention drops it instead, because a session under test is not a
 * case author who can be asked to fix its tree, and one link must not discard
 * the evidence for everything else the session did.
 */
describe("a link the session left pointing out of its attempt directory", () => {
	async function preservedAttemptWithLinks(): Promise<string> {
		const outside = await directory("rehearse-state-outside-");
		await Bun.write(
			join(outside, "operator-secret.txt"),
			"not the session's\n",
		);

		const attempt = await directory("rehearse-state-attempt-");
		await Bun.write(join(attempt, "own-work.txt"), "the session's own\n");
		await symlink(
			join(outside, "operator-secret.txt"),
			join(attempt, "stolen.txt"),
		);
		await symlink(outside, join(attempt, "escape"));

		return preserveStateEvidence(
			attempt,
			await directory("rehearse-state-record-"),
		);
	}

	it("keeps no link into the preserved evidence", async () => {
		const evidence = await preservedAttemptWithLinks();

		expect(await Bun.file(join(evidence, "stolen.txt")).exists()).toBe(false);
		expect(
			await Bun.file(join(evidence, "escape", "operator-secret.txt")).exists(),
		).toBe(false);
	});

	it("keeps the files the session actually wrote", async () => {
		const evidence = await preservedAttemptWithLinks();

		expect(await Bun.file(join(evidence, "own-work.txt")).text()).toBe(
			"the session's own\n",
		);
	});

	it("gives a scorer no path to what the link pointed at", async () => {
		const evidence = await preservedAttemptWithLinks();
		const restored = await restoreStateEvidence(
			evidence,
			await directory("rehearse-state-restore-"),
		);

		const seen = await runAgainstStateEvidence(
			["sh", "-c", "cat stolen.txt 2>&1 || true"],
			restored,
		);

		expect(seen).not.toContain("not the session's");
	});
});

/**
 * A fixture's hooks are refused at seed time, but nothing stops the session
 * under test from writing one into the `.git` it was given. Retention copies
 * whatever it finds, so without a guard the hook runs on the operator's
 * machine at every restore, including a regrade that is supposed to call no
 * provider and execute nothing.
 */
describe("code a session left in its git directory", () => {
	async function attemptExecutingOn(
		plant: (gitDirectory: string) => Promise<void>,
	): Promise<string> {
		const attempt = await attemptWithHistory();
		await plant(join(attempt, ".git"));

		return attempt;
	}

	async function gradedStatus(attempt: string): Promise<void> {
		const evidence = await preserveStateEvidence(
			attempt,
			await directory("rehearse-state-record-"),
		);
		const restored = await restoreStateEvidence(
			evidence,
			await directory("rehearse-state-restore-"),
		);

		await runAgainstStateEvidence(["sh", "-c", "git status --short"], restored);
	}

	it("does not run a hook the session wrote", async () => {
		const witness = join(await directory("rehearse-state-witness-"), "ran");
		const attempt = await attemptExecutingOn(async (gitDirectory) => {
			await mkdir(join(gitDirectory, "hooks"), { recursive: true });
			await Bun.write(
				join(gitDirectory, "hooks", "post-index-change"),
				`#!/bin/sh\ntouch ${witness}\n`,
			);
			await chmod(join(gitDirectory, "hooks", "post-index-change"), 0o755);
		});

		await gradedStatus(attempt);

		expect(await Bun.file(witness).exists()).toBe(false);
	});

	it("does not run a command the session set as core.fsmonitor", async () => {
		const witness = join(await directory("rehearse-state-witness-"), "ran");
		const attempt = await attemptExecutingOn(async (gitDirectory) => {
			await appendFile(
				join(gitDirectory, "config"),
				`[core]\n\tfsmonitor = touch ${witness}\n`,
			);
		});

		await gradedStatus(attempt);

		expect(await Bun.file(witness).exists()).toBe(false);
	});

	it("still reads the history the session left", async () => {
		const attempt = await attemptWithHistory();
		const evidence = await preserveStateEvidence(
			attempt,
			await directory("rehearse-state-record-"),
		);
		const restored = await restoreStateEvidence(
			evidence,
			await directory("rehearse-state-restore-"),
		);

		const log = await runAgainstStateEvidence(
			["sh", "-c", "git log --format=%s"],
			restored,
		);

		expect(log).toBe("second\nfirst\n");
	});
});
