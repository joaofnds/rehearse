import { describe, expect, it } from "bun:test";
import { appendFile, chmod, mkdir } from "node:fs/promises";
import { join } from "node:path";

import {
	preserveStateEvidence,
	restoreStateEvidence,
	runAgainstStateEvidence,
} from "#benchmark/session-state-evidence";

import {
	EXECUTABLE_FILE_MODE,
	attemptExecutingOn,
	attemptWithHistory,
	directory,
	resources,
} from "./session-state-evidence-test-fixtures";

resources.registerCleanup();

async function doesNotRunAHookTheSessionWrote(): Promise<void> {
	const witness = join(await directory("rehearse-state-witness-"), "ran");
	const attempt = await attemptExecutingOn(async (gitDirectory) => {
		await mkdir(join(gitDirectory, "hooks"), { recursive: true });
		await Bun.write(
			join(gitDirectory, "hooks", "post-index-change"),
			`#!/bin/sh\ntouch ${witness}\n`,
		);
		await chmod(
			join(gitDirectory, "hooks", "post-index-change"),
			EXECUTABLE_FILE_MODE,
		);
	});

	const evidence = await preserveStateEvidence(
		attempt,
		await directory("rehearse-state-record-"),
	);
	const restored = await restoreStateEvidence(
		evidence,
		await directory("rehearse-state-restore-"),
	);
	await runAgainstStateEvidence(["sh", "-c", "git status --short"], restored);

	expect(await Bun.file(witness).exists()).toBe(false);
}

async function doesNotRunACommandTheSessionSetAsCoreFsmonitor(): Promise<void> {
	const witness = join(await directory("rehearse-state-witness-"), "ran");
	const attempt = await attemptExecutingOn(async (gitDirectory) => {
		await appendFile(
			join(gitDirectory, "config"),
			`[core]\n\tfsmonitor = touch ${witness}\n`,
		);
	});

	const evidence = await preserveStateEvidence(
		attempt,
		await directory("rehearse-state-record-"),
	);
	const restored = await restoreStateEvidence(
		evidence,
		await directory("rehearse-state-restore-"),
	);
	await runAgainstStateEvidence(["sh", "-c", "git status --short"], restored);

	expect(await Bun.file(witness).exists()).toBe(false);
}

async function stillReadsTheHistoryTheSessionLeft(): Promise<void> {
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
}

describe("code a session left in its git directory", () => {
	it("does not run a hook the session wrote", doesNotRunAHookTheSessionWrote);
	it(
		"does not run a command the session set as core.fsmonitor",
		doesNotRunACommandTheSessionSetAsCoreFsmonitor,
	);
	it(
		"still reads the history the session left",
		stillReadsTheHistoryTheSessionLeft,
	);
});
