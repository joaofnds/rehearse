import { describe, expect, it } from "bun:test";
import { readdir, realpath } from "node:fs/promises";
import { join } from "node:path";

import { runSessionAttempt } from "#benchmark/session-attempt";
import { projectSlug } from "#benchmark/session-capture";
import SessionInvocationError from "#benchmark/session-invocation-error";
import { failureOf } from "#cli/cli-test-support";

import { request } from "./session-attempt-case-test-fixtures";
import { FakeClaude } from "./session-attempt-provider-test-fixtures";
import {
	projectsRoot,
	recordDirectory,
	resources,
} from "./session-attempt-workspace-test-fixtures";

resources.registerCleanup();

async function leavesTheProjectsSlugDirectoryHoldingNoFileTheAttemptCreated(): Promise<void> {
	const projects = await projectsRoot();

	const attempt = await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: new FakeClaude(projects, "OK").run,
		}),
	);

	const slug = join(projects, projectSlug(attempt.attemptDirectory));

	expect(await readdir(slug).catch(() => [])).toEqual([]);
}

async function removesTheTranscriptTheProviderWroteEvenWhenReadingTheEnvelopeFails(): Promise<void> {
	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "OK");
	let attemptCwd = "";

	const attemptRequest = request({
		projectsDirectory: projects,
		recordDirectory: await recordDirectory(),
		runClaude: async (command, cwd) => {
			attemptCwd = await realpath(cwd);
			await claude.run(command, cwd);

			return "not a claude envelope";
		},
	});

	const failure = await failureOf(runSessionAttempt(attemptRequest));

	expect(failure).toBeInstanceOf(Error);
	expect(failure).not.toBeInstanceOf(SessionInvocationError);
	const remainingSessionFiles = await readdir(
		join(projects, projectSlug(attemptCwd)),
	).catch(() => []);
	expect(remainingSessionFiles).toEqual([]);
}

async function removesTheSlugDirectoryItselfOnceTheAttemptSFilesAreGone(): Promise<void> {
	const projects = await projectsRoot();

	const attempt = await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: new FakeClaude(projects, "OK").run,
		}),
	);

	expect(await readdir(projects)).not.toContain(
		projectSlug(attempt.attemptDirectory),
	);
}
describe(runSessionAttempt.name, () => {
	it(
		"leaves the projects slug directory holding no file the attempt created",
		leavesTheProjectsSlugDirectoryHoldingNoFileTheAttemptCreated,
	);
	it(
		"removes the transcript the provider wrote even when reading the envelope fails",
		removesTheTranscriptTheProviderWroteEvenWhenReadingTheEnvelopeFails,
	);
	it(
		"removes the slug directory itself once the attempt's files are gone",
		removesTheSlugDirectoryItselfOnceTheAttemptSFilesAreGone,
	);
});
