import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { SessionAttemptRequest } from "#benchmark/session-attempt";
import { runSessionAttempt } from "#benchmark/session-attempt";
import { failureOf } from "#cli/cli-test-support";

import { request, sessionCase } from "./session-attempt-case-test-fixtures";
import {
	FakeClaude,
	claudeWriting,
} from "./session-attempt-provider-test-fixtures";
import { readFileLine } from "./session-attempt-transcript-test-fixtures";
import {
	fixtureDirectory,
	projectsRoot,
	recordDirectory,
	resources,
} from "./session-attempt-workspace-test-fixtures";

resources.registerCleanup();

async function hashesEachDeclaredProjectFileAsTheFixtureSeededItBeforeTheSessionCouldRewriteIt(): Promise<void> {
	const fixture = await fixtureDirectory();
	await writeFile(join(fixture, "AGENTS.md"), "as seeded\n");
	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "OK");
	const runClaude: SessionAttemptRequest["runClaude"] = async (
		command,
		cwd,
	) => {
		await writeFile(join(cwd, "AGENTS.md"), "as the session left it\n");

		return await claude.run(command, cwd);
	};

	const attempt = await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude,
			sessionCase: sessionCase({
				fixturePath: fixture,
				projectFiles: ["AGENTS.md", "NOTES.md"],
			}),
		}),
	);

	expect(attempt.startingProjectFiles).toEqual([
		{
			path: "AGENTS.md",
			sha256: createHash("sha256").update("as seeded\n").digest("hex"),
		},
	]);
}

async function hashesProjectInstructionsTheSessionLoadedUndeclaredAsTheFixtureSeededThem(): Promise<void> {
	const fixture = await fixtureDirectory();
	await writeFile(join(fixture, "CLAUDE.md"), "as seeded\n");
	const projects = await projectsRoot();
	const runClaude: SessionAttemptRequest["runClaude"] = async (
		command,
		cwd,
	) => {
		await writeFile(join(cwd, "CLAUDE.md"), "as the session left it\n");
		const recording = claudeWriting(
			projects,
			(sessionId, directory) => [
				readFileLine(sessionId, join(directory, "CLAUDE.md")),
			],
			"OK",
		);

		return await recording(command, cwd);
	};

	const attempt = await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude,
			sessionCase: sessionCase({ fixturePath: fixture }),
		}),
	);

	expect(attempt).toMatchObject({
		loadedProjectInstructions: ["CLAUDE.md"],
		startingProjectFiles: [
			{
				path: "CLAUDE.md",
				sha256: createHash("sha256").update("as seeded\n").digest("hex"),
			},
		],
	});
}

async function keepsTheDeclaredProjectFilesStartingHashesOnAnAttemptWhoseSessionFailed(): Promise<void> {
	const fixture = await fixtureDirectory();
	await writeFile(join(fixture, "AGENTS.md"), "as seeded\n");
	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "OK");

	const attemptRequest = request({
		projectsDirectory: projects,
		recordDirectory: await recordDirectory(),
		runClaude: async (command, cwd) => {
			await claude.run(command, cwd);

			throw new Error("claude exited 1");
		},
		sessionCase: sessionCase({
			fixturePath: fixture,
			projectFiles: ["AGENTS.md"],
		}),
	});

	const failure = await failureOf(runSessionAttempt(attemptRequest));

	expect(failure).toMatchObject({
		attempt: {
			outcome: "EXECUTION_FAILED",
			startingProjectFiles: [
				{
					path: "AGENTS.md",
					sha256: createHash("sha256").update("as seeded\n").digest("hex"),
				},
			],
		},
	});
}
describe(runSessionAttempt.name, () => {
	it(
		"hashes each declared project file as the fixture seeded it, before the session could rewrite it",
		hashesEachDeclaredProjectFileAsTheFixtureSeededItBeforeTheSessionCouldRewriteIt,
	);
	it(
		"hashes project instructions the session loaded undeclared as the fixture seeded them",
		hashesProjectInstructionsTheSessionLoadedUndeclaredAsTheFixtureSeededThem,
	);
	it(
		"keeps the declared project files' starting hashes on an attempt whose session failed",
		keepsTheDeclaredProjectFilesStartingHashesOnAnAttemptWhoseSessionFailed,
	);
});
