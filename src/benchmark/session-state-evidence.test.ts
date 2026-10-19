import { describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { runCommand } from "#benchmark/command";
import {
	preserveStateEvidence,
	restoreStateEvidence,
} from "#benchmark/session-state-evidence";

import {
	attemptWithHistory,
	directory,
	evidenceDigest,
	resources,
} from "./session-state-evidence-test-fixtures";

resources.registerCleanup();

async function reproducesTheWorkingTreeAndTheHistoryTheSessionLeft(): Promise<void> {
	const attempt = await attemptWithHistory();
	const before = {
		log: await runCommand(["git", "log", "--format=%H"], attempt),
		status: await runCommand(["git", "status", "--short"], attempt),
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
	expect(await Bun.file(join(restored, "ignored", "secret.txt")).exists()).toBe(
		true,
	);
}

async function leavesTheCorpusOverlayOutWhichTheRecordAlreadyDigestsPerFile(): Promise<void> {
	const attempt = await directory("rehearse-state-attempt-");
	await Bun.write(join(attempt, "own-work.txt"), "the session's own\n");
	await Bun.write(
		join(attempt, ".claude", "skills", "a", "SKILL.md"),
		"corpus\n",
	);

	const evidence = await preserveStateEvidence(
		attempt,
		await directory("rehearse-state-record-"),
	);

	expect(await Bun.file(join(evidence, "own-work.txt")).exists()).toBe(true);
	expect(
		await Bun.file(
			join(evidence, ".claude", "skills", "a", "SKILL.md"),
		).exists(),
	).toBe(false);
}

async function leavesPreservedEvidenceUntouchedByTheGrader(): Promise<void> {
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

	expect(await evidenceDigest(evidence)).toBe(before);
}
async function leavesTheNextRestoreUntouchedByTheGrader(): Promise<void> {
	const attempt = await attemptWithHistory();
	const evidence = await preserveStateEvidence(
		attempt,
		await directory("rehearse-state-record-"),
	);

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

	expect(await Bun.file(join(second, "first.md")).text()).toBe(
		"first, edited\n",
	);
	expect(await Bun.file(join(second, "grader.txt")).exists()).toBe(false);
}

describe(restoreStateEvidence.name, () => {
	it(
		"reproduces the working tree and the history the session left",
		reproducesTheWorkingTreeAndTheHistoryTheSessionLeft,
	);
	it(
		"leaves the corpus overlay out, which the record already digests per file",
		leavesTheCorpusOverlayOutWhichTheRecordAlreadyDigestsPerFile,
	);
	it(
		"leaves preserved evidence untouched by what a grader wrote",
		leavesPreservedEvidenceUntouchedByTheGrader,
	);
	it(
		"leaves the next restore untouched by what a grader wrote",
		leavesTheNextRestoreUntouchedByTheGrader,
	);
});
