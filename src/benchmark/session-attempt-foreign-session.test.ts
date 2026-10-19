import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { runSessionAttempt } from "#benchmark/session-attempt";
import { projectSlug } from "#benchmark/session-capture";

import { request } from "./session-attempt-case-test-fixtures";
import {
	FakeClaude,
	PLANTED_AFTER,
	PLANTED_BEFORE,
	namedSession,
	plantingClaude,
} from "./session-attempt-provider-test-fixtures";
import { transcriptLine } from "./session-attempt-transcript-test-fixtures";
import {
	projectsRoot,
	recordDirectory,
	resources,
} from "./session-attempt-workspace-test-fixtures";

resources.registerCleanup();

async function keepsEveryFileAnotherSessionPlantedInTheSlugDirectoryMidRun(): Promise<void> {
	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "OK");

	const attempt = await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: plantingClaude(projects, claude.run),
		}),
	);

	const slug = join(projects, projectSlug(attempt.attemptDirectory));
	const remaining = await readdir(slug);

	expect(remaining.toSorted()).toEqual([PLANTED_BEFORE, PLANTED_AFTER]);
}

async function recordsTheTranscriptTheProviderSOwnSessionWroteNotAFilePlantedBesideIt(): Promise<void> {
	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "OK");

	const attempt = await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: plantingClaude(projects, claude.run),
		}),
	);

	const [only] = claude.runs;

	expect(await Bun.file(attempt.transcriptFile).text()).toBe(
		`${transcriptLine(namedSession(only?.command ?? []), "OK")}\n`,
	);
}

describe(runSessionAttempt.name, () => {
	it(
		"keeps every file another session planted in the slug directory mid-run",
		keepsEveryFileAnotherSessionPlantedInTheSlugDirectoryMidRun,
	);
	it(
		"records the transcript the provider's own session wrote, not a file planted beside it",
		recordsTheTranscriptTheProviderSOwnSessionWroteNotAFilePlantedBesideIt,
	);
});
