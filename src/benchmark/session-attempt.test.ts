import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { runSessionAttempt } from "#benchmark/session-attempt";

import { request, sessionCase } from "./session-attempt-case-test-fixtures";
import { FakeClaude } from "./session-attempt-provider-test-fixtures";
import {
	projectsRoot,
	recordDirectory,
	resources,
} from "./session-attempt-workspace-test-fixtures";

resources.registerCleanup();

async function runsInAFreshDirectoryThatIsNeitherTheControlRepositoryNorTheCaseDirectory(): Promise<void> {
	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "OK");

	await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: claude.run,
		}),
	);

	const [only] = claude.runs;

	expect(only?.cwd).not.toBe(resolve(import.meta.dir, "../.."));
	expect(only?.cwd).not.toContain("/cases/");
}

async function seedsTheAttemptDirectoryFromTheCaseSFixtureTree(): Promise<void> {
	const fixture = await mkdtemp(join(tmpdir(), "rehearse-fixture-"));
	resources.track(fixture);
	await mkdir(join(fixture, "docs"), { recursive: true });
	await writeFile(join(fixture, "docs", "note.md"), "planted\n");
	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "OK");

	await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: claude.run,
			sessionCase: sessionCase({ fixturePath: fixture }),
		}),
	);

	const [only] = claude.runs;

	expect(only?.seenFiles).toContain(join("docs", "note.md"));
}

async function copiesTheTranscriptTheProviderWroteIntoTheAttemptRecord(): Promise<void> {
	const projects = await projectsRoot();
	const records = await recordDirectory();

	const attempt = await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: records,
			runClaude: new FakeClaude(projects, "OK").run,
		}),
	);

	expect(attempt.reply).toBe("OK");
	expect(await Bun.file(attempt.transcriptFile).text()).toContain("OK");
	expect(attempt.transcriptDiagnostics).toEqual({
		issues: [],
		measuredLineCount: 1,
		prefixLinesExcluded: 0,
		repeatedBashCommands: [],
		sourceLineCount: 1,
		state: "complete",
		toolErrors: [],
		toolUseOccurrences: { byName: [], total: 0 },
	});
}
describe(runSessionAttempt.name, () => {
	it(
		"runs in a fresh directory that is neither the control repository nor the case directory",
		runsInAFreshDirectoryThatIsNeitherTheControlRepositoryNorTheCaseDirectory,
	);
	it(
		"seeds the attempt directory from the case's fixture tree",
		seedsTheAttemptDirectoryFromTheCaseSFixtureTree,
	);
	it(
		"copies the transcript the provider wrote into the attempt record",
		copiesTheTranscriptTheProviderWroteIntoTheAttemptRecord,
	);
});
