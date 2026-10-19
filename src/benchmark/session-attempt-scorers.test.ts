import { describe, expect, it } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { casesRoot, readCaseDeclaration } from "#benchmark/case";
import { runSessionAttempt } from "#benchmark/session-attempt";

import { request, sessionCase } from "./session-attempt-case-test-fixtures";
import { FakeClaude } from "./session-attempt-provider-test-fixtures";
import {
	forgingClaude,
	idleClaude,
	workingClaude,
	writingClaude,
} from "./session-attempt-state-test-fixtures";
import {
	fixtureDirectory,
	projectsRoot,
	recordDirectory,
	resources,
} from "./session-attempt-workspace-test-fixtures";

resources.registerCleanup();

async function gradesTheStateProbeCaseSCommittedScorerOverTheWorkASessionDid(): Promise<void> {
	const declaration = await readCaseDeclaration("state-probe");
	if (declaration.kind !== "session" || declaration.fixture === undefined) {
		throw new Error("state-probe is expected to be a session case");
	}

	const projects = await projectsRoot();
	const fixturePath = join(casesRoot(), "state-probe", declaration.fixture);
	const attemptRequest = request({
		projectsDirectory: projects,
		recordDirectory: await recordDirectory(),
		runClaude: workingClaude(projects),
		sessionCase: sessionCase({
			checks: declaration.checks,
			declaration,
			fixturePath,
			stateCheck: declaration.stateCheck,
		}),
	});
	const attempt = await runSessionAttempt(attemptRequest);

	expect(attempt.stateResults).toEqual([
		{
			detail: "LEDGER.md carries the February refund",
			name: "ledger-amended",
			status: "PASS",
		},
		{
			detail: "the top commit posts the February refund",
			name: "work-committed",
			status: "PASS",
		},
		{
			detail: "nothing is left uncommitted",
			name: "tree-clean",
			status: "PASS",
		},
	]);
}

async function gradesWithTheCaseSScorerNotAFileTheSessionWroteAtItsPath(): Promise<void> {
	const declaration = await readCaseDeclaration("state-probe");
	if (declaration.kind !== "session" || declaration.fixture === undefined) {
		throw new Error("state-probe is expected to be a session case");
	}

	const projects = await projectsRoot();
	const fixturePath = join(casesRoot(), "state-probe", declaration.fixture);
	const attemptRequest = request({
		projectsDirectory: projects,
		recordDirectory: await recordDirectory(),
		runClaude: forgingClaude(projects),
		sessionCase: sessionCase({
			checks: declaration.checks,
			declaration,
			fixturePath,
			stateCheck: declaration.stateCheck,
		}),
	});
	const attempt = await runSessionAttempt(attemptRequest);

	expect(attempt.stateResults).toContainEqual({
		detail: "the top commit posts the February refund",
		name: "work-committed",
		status: "FAIL",
	});
}

async function gradesWithTheCaseSScorerWhenTheSessionLeftADirectoryAtItsPath(): Promise<void> {
	const declaration = await readCaseDeclaration("state-probe");
	if (declaration.kind !== "session" || declaration.fixture === undefined) {
		throw new Error("state-probe is expected to be a session case");
	}

	const projects = await projectsRoot();
	const fixturePath = join(casesRoot(), "state-probe", declaration.fixture);
	const attemptRequest = request({
		projectsDirectory: projects,
		recordDirectory: await recordDirectory(),
		runClaude: writingClaude(projects, { "score.sh/planted.md": "x\n" }),
		sessionCase: sessionCase({
			checks: declaration.checks,
			declaration,
			fixturePath,
			stateCheck: declaration.stateCheck,
		}),
	});
	const attempt = await runSessionAttempt(attemptRequest);

	expect(attempt.stateResults).toContainEqual({
		detail: "the top commit posts the February refund",
		name: "work-committed",
		status: "FAIL",
	});
}

async function seedsNoScorerFileIntoTheTreeTheSessionWorksIn(): Promise<void> {
	const declaration = await readCaseDeclaration("state-probe");
	if (declaration.kind !== "session" || declaration.fixture === undefined) {
		throw new Error("state-probe is expected to be a session case");
	}

	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "OK");

	const fixturePath = join(casesRoot(), "state-probe", declaration.fixture);
	await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: claude.run,
			sessionCase: sessionCase({
				checks: declaration.checks,
				declaration,
				fixturePath,
				stateCheck: declaration.stateCheck,
			}),
		}),
	);

	const [observedFirstRun] = claude.runs;

	expect(observedFirstRun?.seenFiles).toContain("LEDGER.md");
	expect(observedFirstRun?.seenFiles).not.toContain("score.sh");
}

async function withholdsAScorerTheCommandNamesUnderTwoSpellings(): Promise<void> {
	const fixture = await fixtureDirectory();
	await writeFile(join(fixture, "score.sh"), "exit 0\n");
	await writeFile(join(fixture, "LEDGER.md"), "ledger\n");
	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "OK");

	await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: claude.run,
			sessionCase: sessionCase({
				fixturePath: fixture,
				stateCheck: {
					command: ["sh", "score.sh", "./score.sh"],
					outcomes: ["graded"],
				},
			}),
		}),
	);

	const [observedFirstRun] = claude.runs;

	expect(observedFirstRun?.seenFiles).toEqual(["LEDGER.md"]);
}

async function failsTheCommittedCaseSCommitGradeForASessionThatDidNothing(): Promise<void> {
	const declaration = await readCaseDeclaration("state-probe");
	if (declaration.kind !== "session" || declaration.fixture === undefined) {
		throw new Error("state-probe is expected to be a session case");
	}

	const projects = await projectsRoot();
	const fixturePath = join(casesRoot(), "state-probe", declaration.fixture);
	const attemptRequest = request({
		projectsDirectory: projects,
		recordDirectory: await recordDirectory(),
		runClaude: idleClaude(projects),
		sessionCase: sessionCase({
			checks: declaration.checks,
			declaration,
			fixturePath,
			stateCheck: declaration.stateCheck,
		}),
	});
	const attempt = await runSessionAttempt(attemptRequest);

	expect(attempt.outcome).toBe("SUCCESSFUL");
	expect(attempt.stateResults).toContainEqual({
		detail: "the top commit posts the February refund",
		name: "work-committed",
		status: "FAIL",
	});
}
describe("the state evidence a session attempt preserves", () => {
	it(
		"grades the state-probe case's committed scorer over the work a session did",
		gradesTheStateProbeCaseSCommittedScorerOverTheWorkASessionDid,
	);
	it(
		"grades with the case's scorer, not a file the session wrote at its path",
		gradesWithTheCaseSScorerNotAFileTheSessionWroteAtItsPath,
	);
	it(
		"grades with the case's scorer when the session left a directory at its path",
		gradesWithTheCaseSScorerWhenTheSessionLeftADirectoryAtItsPath,
	);
	it(
		"seeds no scorer file into the tree the session works in",
		seedsNoScorerFileIntoTheTreeTheSessionWorksIn,
	);
	it(
		"withholds a scorer the command names under two spellings",
		withholdsAScorerTheCommandNamesUnderTwoSpellings,
	);
	it(
		"fails the committed case's commit grade for a session that did nothing",
		failsTheCommittedCaseSCommitGradeForASessionThatDidNothing,
	);
});
