import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import {
	SessionInputError,
	runSessionAttempt,
} from "#benchmark/session-attempt";
import { failureOf } from "#cli/cli-test-support";

import { request, sessionCase } from "./session-attempt-case-test-fixtures";
import { breakages } from "./session-attempt-history-test-fixtures";
import { FakeClaude } from "./session-attempt-provider-test-fixtures";
import {
	attemptDirectories,
	escapingFixture,
	gitPointerFixture,
	hookedHistoryFixture,
	projectsRoot,
	recordDirectory,
	resources,
} from "./session-attempt-workspace-test-fixtures";

resources.registerCleanup();

async function refusesAFixtureWhoseDotGitIsAFileRatherThanADirectory(): Promise<void> {
	const fixture = await gitPointerFixture();
	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "OK");

	const attemptRequest = request({
		projectsDirectory: projects,
		recordDirectory: await recordDirectory(),
		runClaude: claude.run,
		sessionCase: sessionCase({ fixturePath: fixture }),
	});

	const failure = await failureOf(runSessionAttempt(attemptRequest));

	expect(failure).toBeInstanceOf(SessionInputError);
	expect(failure.message).toContain("dot-git");
	expect(claude.runs).toEqual([]);
}

async function refusesAFixtureWhoseHistoryCarriesGitHooksBeforeRunningAnyGitCommand(): Promise<void> {
	const { fixture, marker } = await hookedHistoryFixture();
	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "OK");

	const attemptRequest = request({
		projectsDirectory: projects,
		recordDirectory: await recordDirectory(),
		runClaude: claude.run,
		sessionCase: sessionCase({ fixturePath: fixture.path }),
	});

	const failure = await failureOf(runSessionAttempt(attemptRequest));

	expect(failure).toBeInstanceOf(SessionInputError);
	expect(failure.message).toContain("hooks");
	expect(claude.runs).toEqual([]);
	expect(await Bun.file(marker).exists()).toBe(false);
}

async function refusesAFixtureTreeHoldingASymlinkNamingItBeforeAnyProviderCall(): Promise<void> {
	const fixture = await escapingFixture();
	const projects = await projectsRoot();
	const attemptDirectoriesBefore = await attemptDirectories();

	const attemptRequest = request({
		projectsDirectory: projects,
		recordDirectory: await recordDirectory(),
		runClaude: async () =>
			await Promise.reject(new Error("a provider call must not happen")),
		sessionCase: sessionCase({ fixturePath: fixture }),
	});

	const failure = await failureOf(runSessionAttempt(attemptRequest));

	expect(failure.message).toContain(join("docs", "escape.md"));
	const newAttemptDirectories = [...(await attemptDirectories())].filter(
		(path) => !attemptDirectoriesBefore.has(path),
	);
	expect(newAttemptDirectories).toEqual([]);
}
describe(runSessionAttempt.name, () => {
	it(
		"refuses a fixture whose dot-git is a file rather than a directory",
		refusesAFixtureWhoseDotGitIsAFileRatherThanADirectory,
	);
	it(
		"refuses a fixture whose history carries git hooks, before running any git command",
		refusesAFixtureWhoseHistoryCarriesGitHooksBeforeRunningAnyGitCommand,
	);
	it(
		"refuses a fixture tree holding a symlink, naming it, before any provider call",
		refusesAFixtureTreeHoldingASymlinkNamingItBeforeAnyProviderCall,
	);
	describe("a fixture whose seeded history is unusable", () => {
		for (const breakage of breakages) {
			it(`is refused by name before any provider call when it ${breakage.name}`, async () => {
				const fixture = await resources.createHistory(["first", "second"]);
				await breakage.corrupt(join(fixture.path, "dot-git"), fixture.commits);
				const projects = await projectsRoot();
				const claude = new FakeClaude(projects, "OK");

				const attemptRequest = request({
					projectsDirectory: projects,
					recordDirectory: await recordDirectory(),
					runClaude: claude.run,
					sessionCase: sessionCase({ fixturePath: fixture.path }),
				});

				const failure = await failureOf(runSessionAttempt(attemptRequest));

				expect(failure).toBeInstanceOf(SessionInputError);
				expect(failure.message).toContain(fixture.path);
				expect(failure.message).toContain(breakage.stderr);
				expect(claude.runs).toEqual([]);
			});
		}
	});
});
