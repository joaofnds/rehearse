import { describe, expect, it } from "bun:test";
import { symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { EXIT_CODES, exitCodeFor } from "#benchmark/exit-codes";
import ABSENT_HOME from "#benchmark/session-setup-test-fixtures";
import { failureOf } from "#cli/cli-test-support";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import { runSessionDebugAttempt } from "#cli/session-run-command";

import SessionAttemptTestFiles from "./session-attempt-test-files";
import {
	SessionCaseBuilder,
	config,
	resumingCase,
} from "./session-case-test-fixture";

const files = SessionAttemptTestFiles.forEachTest();

async function refusesAFixtureTreeHoldingASymlinkBeforeAnyProviderCall(): Promise<void> {
	const runs = await files.temporary("rehearse-runs-");
	const projects = await files.temporary("rehearse-projects-");
	const fixture = await files.temporary("rehearse-fixture-");
	await symlink("/etc/hosts", join(fixture, "escape.md"));

	const failure = await failureOf(
		runSessionDebugAttempt({
			config,
			home: ABSENT_HOME,
			projectsDirectory: projects,
			runClaude: async () =>
				await Promise.reject(new Error("a provider call must not happen")),
			runsDirectory: runs,
			sessionCase: new SessionCaseBuilder({ fixturePath: fixture }).build(),
			spendCeilingUsd: 100,
		}),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain("escape.md");
}

async function refusesAFixtureWhoseSeededHistoryGitCannotReadExiting3BeforeAnyProviderCall(): Promise<void> {
	const runs = await files.temporary("rehearse-runs-");
	const projects = await files.temporary("rehearse-projects-");
	const fixture = await files.unreadableHistory();

	const calls: string[] = [];

	const failure = await failureOf(
		runSessionDebugAttempt({
			config,
			home: ABSENT_HOME,
			projectsDirectory: projects,
			runClaude: async (_command, cwd) => {
				calls.push(cwd);

				return await Promise.resolve("");
			},
			runsDirectory: runs,
			sessionCase: new SessionCaseBuilder({ fixturePath: fixture }).build(),
			spendCeilingUsd: 100,
		}),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(exitCodeFor(failure)).toBe(EXIT_CODES.refusedPrecondition);
	expect(failure.message).toContain(fixture);
	expect(calls).toEqual([]);
}

async function refusesATranscriptPrefixWhoseBytesDoNotMatchTheDeclaredDigestBeforeAnyProviderCall(): Promise<void> {
	const runs = await files.temporary("rehearse-runs-");
	const projects = await files.temporary("rehearse-projects-");
	const prefix = join(
		await files.temporary("rehearse-prefix-"),
		"prefix.jsonl",
	);
	await writeFile(prefix, "bytes the declaration never hashed\n");

	const failure = await failureOf(
		runSessionDebugAttempt({
			config,
			home: ABSENT_HOME,
			projectsDirectory: projects,
			runClaude: async () =>
				await Promise.reject(new Error("a provider call must not happen")),
			runsDirectory: runs,
			sessionCase: resumingCase(prefix),
			spendCeilingUsd: 100,
		}),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain("prefix.jsonl");
}

describe(runSessionDebugAttempt.name, () => {
	it(
		"refuses a fixture tree holding a symlink, before any provider call",
		refusesAFixtureTreeHoldingASymlinkBeforeAnyProviderCall,
	);
	it(
		"refuses a fixture whose seeded history git cannot read, exiting 3 before any provider call",
		refusesAFixtureWhoseSeededHistoryGitCannotReadExiting3BeforeAnyProviderCall,
	);
	it(
		"refuses a transcript prefix whose bytes do not match the declared digest, before any provider call",
		refusesATranscriptPrefixWhoseBytesDoNotMatchTheDeclaredDigestBeforeAnyProviderCall,
	);
});
