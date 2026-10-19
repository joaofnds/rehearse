import { describe, expect, it } from "bun:test";
import { realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { runSessionAttempt } from "#benchmark/session-attempt";
import { projectSlug } from "#benchmark/session-capture";

import {
	SOURCE_SESSION,
	request,
	sessionCase,
} from "./session-attempt-case-test-fixtures";
import {
	FakeClaude,
	OPTION_VALUE_POSITION_OFFSET,
	appendingClaude,
} from "./session-attempt-provider-test-fixtures";
import {
	POST_CUT_BASH_DIAGNOSTICS,
	bashToolUseLine,
	envelope,
	readFileLine,
	skillBodyLine,
	toolResultLine,
	toolUseLine,
	transcriptLine,
} from "./session-attempt-transcript-test-fixtures";
import {
	projectsRoot,
	recordDirectory,
	resources,
	resumingCase,
	writtenPrefix,
} from "./session-attempt-workspace-test-fixtures";

resources.registerCleanup();

async function copiesTheForkedTranscriptWhenTheResumedSessionAppendsToItRatherThanWritingANewFile(): Promise<void> {
	const prefix = await writtenPrefix(
		`${transcriptLine(SOURCE_SESSION, "the codeword is PLUMBAGO")}\n`,
	);
	const projects = await projectsRoot();

	const attempt = await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: appendingClaude(projects, "PLUMBAGO"),
			sessionCase: resumingCase(prefix.path, prefix.sha256),
		}),
	);

	expect(await Bun.file(attempt.transcriptFile).text()).toContain("PLUMBAGO");
	expect(attempt.transcriptDiagnostics).toMatchObject({
		measuredLineCount: 1,
		prefixLinesExcluded: 1,
		sourceLineCount: 2,
		state: "complete",
	});
}

async function keepsTheFirstPostCutCallWhenTheCapturedPrefixContainsABlankPhysicalLine(): Promise<void> {
	const prefix = await writtenPrefix(
		`${transcriptLine(SOURCE_SESSION, "first")}\n\n${transcriptLine(SOURCE_SESSION, "second")}\n`,
	);
	const projects = await projectsRoot();
	const base = resumingCase(prefix.path, prefix.sha256);
	const resumed = {
		...base,
		declaration: {
			...base.declaration,
			transcript: {
				cut: 2,
				file: "prefix.jsonl",
				sha256: prefix.sha256,
				sourceSession: SOURCE_SESSION,
			},
		},
	};

	const attempt = await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: async (command, cwd) => {
				const sessionId =
					command[command.indexOf("--resume") + OPTION_VALUE_POSITION_OFFSET] ??
					"";
				const slug = join(projects, projectSlug(await realpath(cwd)));
				const file = join(slug, `${sessionId}.jsonl`);
				await writeFile(
					file,
					`${await Bun.file(file).text()}${bashToolUseLine(sessionId, "bash-1", "pwd")}\n${toolResultLine("bash-1", true)}\n${transcriptLine(sessionId, "OK")}\n`,
				);

				return envelope("OK");
			},
			sessionCase: resumed,
		}),
	);

	expect(attempt.transcriptDiagnostics).toEqual(POST_CUT_BASH_DIAGNOSTICS);
}

async function scoresAToolCallsCheckAgainstTheTurnUnderTestNotTheSeededTranscriptPrefix(): Promise<void> {
	const prefix = await writtenPrefix(`${toolUseLine(SOURCE_SESSION)}\n`);
	const projects = await projectsRoot();

	const attempt = await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: appendingClaude(projects, "OK"),
			sessionCase: resumingCase(prefix.path, prefix.sha256, {
				checks: [{ kind: "tool-calls", max: 0 }],
			}),
		}),
	);

	expect(attempt.checks).toEqual([
		{ detail: "0 tool calls", kind: "tool-calls", status: "PASS" },
	]);
}

async function scoresAFilesReadCheckAgainstTheTurnUnderTestNotAFileTheSeededPrefixRead(): Promise<void> {
	const prefix = await writtenPrefix(
		`${readFileLine(SOURCE_SESSION, "prefix-only.md")}\n`,
	);
	const projects = await projectsRoot();

	const attempt = await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: appendingClaude(projects, "OK"),
			sessionCase: resumingCase(prefix.path, prefix.sha256, {
				checks: [{ kind: "files-read", paths: ["prefix-only.md"] }],
			}),
		}),
	);

	expect(attempt.checks).toEqual([
		{
			detail: "never read prefix-only.md",
			kind: "files-read",
			status: "FAIL",
		},
	]);
}

async function excludesASkillLoadedOnlyInTheSeededTranscriptPrefixFromTheRecordedContextManifest(): Promise<void> {
	const prefix = await writtenPrefix(
		`${skillBodyLine(SOURCE_SESSION, "verify")}\n`,
	);
	const projects = await projectsRoot();

	const attempt = await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: appendingClaude(projects, "OK"),
			sessionCase: resumingCase(prefix.path, prefix.sha256),
		}),
	);

	expect(attempt.contextManifest?.paths).not.toContainEqual({
		half: "corpus",
		path: "skills/verify/SKILL.md",
	});
}

async function countsEveryToolUseInTheTurnWhenTheCaseDeclaresNoTranscriptPrefix(): Promise<void> {
	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "OK");

	const attempt = await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: claude.run,
			sessionCase: sessionCase({
				checks: [{ kind: "tool-calls", max: 0 }],
			}),
		}),
	);

	expect(attempt.checks).toEqual([
		{ detail: "0 tool calls", kind: "tool-calls", status: "PASS" },
	]);
}
describe(runSessionAttempt.name, () => {
	it(
		"copies the forked transcript when the resumed session appends to it rather than writing a new file",
		copiesTheForkedTranscriptWhenTheResumedSessionAppendsToItRatherThanWritingANewFile,
	);
	it(
		"keeps the first post-cut call when the captured prefix contains a blank physical line",
		keepsTheFirstPostCutCallWhenTheCapturedPrefixContainsABlankPhysicalLine,
	);
	it(
		"scores a tool-calls check against the turn under test, not the seeded transcript prefix",
		scoresAToolCallsCheckAgainstTheTurnUnderTestNotTheSeededTranscriptPrefix,
	);
	it(
		"scores a files-read check against the turn under test, not a file the seeded prefix read",
		scoresAFilesReadCheckAgainstTheTurnUnderTestNotAFileTheSeededPrefixRead,
	);
	it(
		"excludes a skill loaded only in the seeded transcript prefix from the recorded context manifest",
		excludesASkillLoadedOnlyInTheSeededTranscriptPrefixFromTheRecordedContextManifest,
	);
	it(
		"counts every tool use in the turn when the case declares no transcript prefix",
		countsEveryToolUseInTheTurnWhenTheCaseDeclaresNoTranscriptPrefix,
	);
});
