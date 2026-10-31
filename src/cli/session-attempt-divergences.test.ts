import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { runSessionDebugAttempt } from "#cli/session-run-command";

import SessionAttemptTestFiles from "./session-attempt-test-files";
import { SessionCaseBuilder, config } from "./session-case-test-fixture";
import SessionCorpusFixture from "./session-corpus-test-fixture";
import {
	fakeClaude,
	undeclaredSkillClaude,
} from "./session-provider-test-fixture";
import SessionRunRequestBuilder from "./session-run-request-test-builder";

const files = SessionAttemptTestFiles.forEachTest();

const corpora = new SessionCorpusFixture(files);

/**
 * The declared file resolves and hashes successfully in hashCorpusFiles, so
 * the attempt still runs; the fake session's transcript carries no tool_use
 * that would name it, which is what reaches the divergence path rather than
 * short-circuiting on the pre-flight missing-file refusal (ACT-59 AC#6).
 */
async function reportsAnUnloadedFileDivergenceForADeclaredCorpusFileTheSessionNeverRead(): Promise<void> {
	const outcome = await runSessionDebugAttempt(
		await corpora.requestFor(await corpora.corpusDirectory("marker brief\n")),
	);

	expect(outcome.record.divergences).toEqual([
		{
			half: "corpus",
			kind: "unloaded-file",
			path: "output-styles/brief.md",
		},
	]);
}

async function reportsAnUndeclaredFileDivergenceForASkillTheSessionLoadedButTheCaseNeverDeclared(): Promise<void> {
	const projects = await files.temporary("rehearse-projects-");
	const runsDirectory = await files.temporary("rehearse-runs-");
	const runClaude = undeclaredSkillClaude(projects);

	const outcome = await runSessionDebugAttempt(
		new SessionRunRequestBuilder({
			projectsDirectory: projects,
			runClaude,
			runsDirectory,
			sessionCase: new SessionCaseBuilder({ isolated: true }).build(),
		}).build(),
	);

	expect(outcome.record.divergences).toEqual([
		{
			half: "corpus",
			kind: "undeclared-file",
			path: "skills/verify/SKILL.md",
		},
	]);
}

/**
 * Under the actual setup the attempt installs the whole corpus, so a skill the
 * case never declared reaches the session from the attempt's own `.claude`.
 */
async function reportsAnUndeclaredFileDivergenceForAnInstalledSkillTheCaseNeverDeclared(): Promise<void> {
	const projects = await files.temporary("rehearse-projects-");
	const runsDirectory = await files.temporary("rehearse-runs-");
	const corpus = await files.temporary("rehearse-corpus-");
	await Bun.write(join(corpus, "skills/verify/SKILL.md"), "verify skill\n");

	const outcome = await runSessionDebugAttempt(
		new SessionRunRequestBuilder({
			config: { ...config, corpus },
			projectsDirectory: projects,
			runClaude: undeclaredSkillClaude(projects, (cwd) =>
				join(cwd, ".claude/skills/verify"),
			),
			runsDirectory,
		}).build(),
	);

	expect(outcome.record.divergences).toEqual([
		{
			half: "corpus",
			kind: "undeclared-file",
			path: "skills/verify/SKILL.md",
		},
	]);
}

async function reportsAnUnloadedFileDivergenceForADeclaredProjectFileTheSessionNeverReadTaggedProjectHalf(): Promise<void> {
	const projects = await files.temporary("rehearse-projects-");
	const runsDirectory = await files.temporary("rehearse-runs-");

	const outcome = await runSessionDebugAttempt(
		new SessionRunRequestBuilder({
			projectsDirectory: projects,
			runClaude: fakeClaude(projects, "OK"),
			runsDirectory,
			sessionCase: new SessionCaseBuilder({
				projectFiles: ["NOTES.md"],
			}).build(),
		}).build(),
	);

	expect(outcome.record.divergences).toEqual([
		{ half: "project", kind: "unloaded-file", path: "NOTES.md" },
	]);
}

describe("running a session case against a corpus source", () => {
	it(
		"reports an unloaded-file divergence for a declared corpus file the session never read",
		reportsAnUnloadedFileDivergenceForADeclaredCorpusFileTheSessionNeverRead,
	);
	it(
		"reports an undeclared-file divergence for a skill the session loaded but the case never declared",
		reportsAnUndeclaredFileDivergenceForASkillTheSessionLoadedButTheCaseNeverDeclared,
	);
	it(
		"reports an undeclared-file divergence for an installed skill the case never declared",
		reportsAnUndeclaredFileDivergenceForAnInstalledSkillTheCaseNeverDeclared,
	);
	it(
		"reports an unloaded-file divergence for a declared project file the session never read, tagged project-half",
		reportsAnUnloadedFileDivergenceForADeclaredProjectFileTheSessionNeverReadTaggedProjectHalf,
	);
});
