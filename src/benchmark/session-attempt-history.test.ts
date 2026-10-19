import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { casesRoot, readCaseDeclaration } from "#benchmark/case";
import { runSessionAttempt } from "#benchmark/session-attempt";

import { request, sessionCase } from "./session-attempt-case-test-fixtures";
import {
	FIRST_RECORDED_PROVIDER_RUN_INDEX,
	FakeClaude,
	SECOND_SHELL_OUTPUT_INDEX,
} from "./session-attempt-provider-test-fixtures";
import {
	projectsRoot,
	recordDirectory,
	resources,
} from "./session-attempt-workspace-test-fixtures";

resources.registerCleanup();

async function seedsAFixtureSDotGitAsAWorkingGitDirectoryTheSessionCanRead(): Promise<void> {
	const fixture = await resources.createHistory(["first", "second"]);
	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "OK", [
		["git", "log", "--format=%H %s"],
		["git", "status", "--short"],
	]);

	await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: claude.run,
			sessionCase: sessionCase({ fixturePath: fixture.path }),
		}),
	);

	const [observedFirstRun] = claude.runs;
	const [observedFirstCommit, observedSecondCommit] = fixture.commits;

	expect(observedFirstRun?.shellOutputs).toEqual([
		`${observedSecondCommit} second\n${observedFirstCommit} first\n`,
		"",
	]);
}

async function reportsTheSameHistoryToEveryAttemptSeededFromOneFixture(): Promise<void> {
	const fixture = await resources.createHistory(["first", "second"]);
	const log = [["git", "log", "--format=%H"]];
	const projects = await projectsRoot();
	const first = new FakeClaude(projects, "OK", log);
	const second = new FakeClaude(projects, "OK", log);

	await Array.fromAsync([first, second], async (claude) => {
		await runSessionAttempt(
			request({
				projectsDirectory: projects,
				recordDirectory: await recordDirectory(),
				runClaude: claude.run,
				sessionCase: sessionCase({ fixturePath: fixture.path }),
			}),
		);
	});

	const [observedFirstCommit, observedSecondCommit] = fixture.commits;

	const [observedUpdatedFirstRun] = first.runs;

	expect(second.runs[FIRST_RECORDED_PROVIDER_RUN_INDEX]?.shellOutputs).toEqual(
		observedUpdatedFirstRun?.shellOutputs ?? [],
	);
	expect(observedUpdatedFirstRun?.shellOutputs).toEqual([
		`${observedSecondCommit}\n${observedFirstCommit}\n`,
	]);
}

async function commitsUnderTheIdentityTheFixtureSConfigDeclares(): Promise<void> {
	const fixture = await resources.createHistory(["first"]);
	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "OK", [
		["git", "commit", "--allow-empty", "-m", "session work"],
		["git", "log", "-1", "--format=%an <%ae>"],
	]);

	await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: claude.run,
			sessionCase: sessionCase({ fixturePath: fixture.path }),
		}),
	);

	const [observedFirstRun] = claude.runs;

	expect(observedFirstRun?.shellOutputs[SECOND_SHELL_OUTPUT_INDEX]).toBe(
		"Fixture Author <fixture@example.com>\n",
	);
}

async function leavesADotGitDirectoryBelowTheFixtureRootAsAnOrdinaryDirectory(): Promise<void> {
	const fixture = await mkdtemp(join(tmpdir(), "rehearse-fixture-"));
	resources.track(fixture);
	await mkdir(join(fixture, "sub", "dot-git"), { recursive: true });
	await writeFile(join(fixture, "sub", "dot-git", "HEAD"), "not history\n");
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

	const [observedFirstRun] = claude.runs;

	expect(observedFirstRun?.seenFiles).toContain(join("sub", "dot-git", "HEAD"));
}

async function reportsAPackedFixtureSOwnCommitsRatherThanAnEnclosingRepositoryS(): Promise<void> {
	const fixture = await resources.createHistory(["first", "second"], {
		packed: true,
	});
	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "OK", [
		["git", "log", "--format=%H"],
	]);

	await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: claude.run,
			sessionCase: sessionCase({ fixturePath: fixture.path }),
		}),
	);

	const [observedFirstRun] = claude.runs;
	const [observedFirstCommit, observedSecondCommit] = fixture.commits;

	expect(observedFirstRun?.shellOutputs).toEqual([
		`${observedSecondCommit}\n${observedFirstCommit}\n`,
	]);
}

async function seedsTheCommittedHistoryASessionReadsUnderTheFixtureSIdentity(): Promise<void> {
	const declaration = await readCaseDeclaration("history-probe");
	if (declaration.kind !== "session" || declaration.fixture === undefined) {
		throw new Error(
			"history-probe is expected to be a session case with a fixture",
		);
	}

	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "OK", [
		["git", "log", "--format=%H %an <%ae> %s"],
		["git", "status", "--short"],
	]);
	const fixturePath = join(casesRoot(), "history-probe", declaration.fixture);
	const attemptRequest = request({
		projectsDirectory: projects,
		recordDirectory: await recordDirectory(),
		runClaude: claude.run,
		sessionCase: sessionCase({
			fixturePath,
		}),
	});
	await runSessionAttempt(attemptRequest);

	const [observedFirstRun] = claude.runs;

	expect(observedFirstRun?.shellOutputs).toEqual([
		"a824bc8e7a7c06e9dbd5ee729c31dc52feac332a Rehearse Fixture <fixture@rehearse.invalid> fix(ledger): post the supplier refund that was missed\n4bc2c5ac67723d47bc33df3d92455ec32440b255 Rehearse Fixture <fixture@rehearse.invalid> feat(ledger): record the opening balance\n",
		"",
	]);
}
describe(runSessionAttempt.name, () => {
	it(
		"seeds a fixture's dot-git as a working git directory the session can read",
		seedsAFixtureSDotGitAsAWorkingGitDirectoryTheSessionCanRead,
	);
	it(
		"reports the same history to every attempt seeded from one fixture",
		reportsTheSameHistoryToEveryAttemptSeededFromOneFixture,
	);
	it(
		"commits under the identity the fixture's config declares",
		commitsUnderTheIdentityTheFixtureSConfigDeclares,
	);
	it(
		"leaves a dot-git directory below the fixture root as an ordinary directory",
		leavesADotGitDirectoryBelowTheFixtureRootAsAnOrdinaryDirectory,
	);
	it(
		"reports a packed fixture's own commits rather than an enclosing repository's",
		reportsAPackedFixtureSOwnCommitsRatherThanAnEnclosingRepositoryS,
	);
});
describe("over the history-probe case", () => {
	it(
		"seeds the committed history a session reads, under the fixture's identity",
		seedsTheCommittedHistoryASessionReadsUnderTheFixtureSIdentity,
	);
});
