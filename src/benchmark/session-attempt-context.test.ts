import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SessionAttemptRequest } from "#benchmark/session-attempt";
import { runSessionAttempt } from "#benchmark/session-attempt";
import { projectSlug } from "#benchmark/session-capture";

import { request, sessionCase } from "./session-attempt-case-test-fixtures";
import {
	claudeWriting,
	namedSession,
} from "./session-attempt-provider-test-fixtures";
import {
	envelope,
	outputStyleLine,
	readFileLine,
	skillBodyLine,
	transcriptLine,
} from "./session-attempt-transcript-test-fixtures";
import {
	projectsRoot,
	recordDirectory,
	resources,
	snapshotHolding,
} from "./session-attempt-workspace-test-fixtures";

resources.registerCleanup();

async function namesALoadedSkillSLayoutPathInTheRecordedContextManifest(): Promise<void> {
	const projects = await projectsRoot();

	const attempt = await runSessionAttempt(
		request({
			corpusSnapshot: await snapshotHolding(
				"skills/verify/SKILL.md",
				"verify skill\n",
			),
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: claudeWriting(
				projects,
				(sessionId, cwd) => [skillBodyLine(sessionId, "verify", cwd)],
				"OK",
			),
		}),
	);

	expect(attempt.contextManifest?.paths).toContainEqual({
		half: "corpus",
		path: "skills/verify/SKILL.md",
	});
}

async function leavesOutOfTheRecordedContextManifestASkillTheSessionWroteBesideTheInstalledCorpus(): Promise<void> {
	const projects = await projectsRoot();

	const attempt = await runSessionAttempt(
		request({
			corpusSnapshot: await snapshotHolding(
				"skills/verify/SKILL.md",
				"verify skill\n",
			),
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: claudeWriting(
				projects,
				(sessionId, cwd) => [skillBodyLine(sessionId, "planted", cwd)],
				"OK",
			),
		}),
	);

	expect(attempt.contextManifest?.paths).not.toContainEqual({
		half: "corpus",
		path: "skills/planted/SKILL.md",
	});
}

async function leavesOutOfTheRecordedContextManifestASkillLoadedFromAClaudeOutsideTheSessionSCorpus(): Promise<void> {
	const projects = await projectsRoot();

	const attempt = await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: claudeWriting(
				projects,
				(sessionId) => [skillBodyLine(sessionId, "planted", "/tmp/elsewhere")],
				"OK",
			),
		}),
	);

	expect(attempt.contextManifest?.paths).not.toContainEqual({
		half: "corpus",
		path: "skills/planted/SKILL.md",
	});
}

async function namesADeclaredProjectFileSReadAsAProjectHalfEntryInTheRecordedContextManifest(): Promise<void> {
	const fixture = await mkdtemp(join(tmpdir(), "rehearse-fixture-"));
	resources.track(fixture);
	await writeFile(join(fixture, "NOTES.md"), "planted\n");
	const projects = await projectsRoot();
	const runClaude: SessionAttemptRequest["runClaude"] = async (
		command,
		cwd,
	) => {
		const sessionId = namedSession(command);
		const slug = join(projects, projectSlug(await realpath(cwd)));
		await mkdir(slug, { recursive: true });
		await writeFile(
			join(slug, `${sessionId}.jsonl`),
			`${[
				readFileLine(sessionId, join(cwd, "NOTES.md")),
				transcriptLine(sessionId, "OK"),
			].join("\n")}\n`,
		);

		return envelope("OK");
	};

	const attempt = await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude,
			sessionCase: sessionCase({
				fixturePath: fixture,
				projectFiles: ["NOTES.md"],
			}),
		}),
	);

	expect(attempt.contextManifest?.paths).toContainEqual({
		half: "project",
		path: "NOTES.md",
	});
}

async function namesTheLastOutputStyleAttachmentSLayoutPathInTheRecordedContextManifest(): Promise<void> {
	const projects = await projectsRoot();

	const attempt = await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: claudeWriting(
				projects,
				() => [outputStyleLine("brief")],
				"OK",
			),
		}),
	);

	expect(attempt.contextManifest?.paths).toContainEqual({
		half: "corpus",
		path: "output-styles/brief.md",
	});
}
describe(runSessionAttempt.name, () => {
	it(
		"names a loaded skill's layout path in the recorded context manifest",
		namesALoadedSkillSLayoutPathInTheRecordedContextManifest,
	);
	it(
		"leaves out of the recorded context manifest a skill the session wrote beside the installed corpus",
		leavesOutOfTheRecordedContextManifestASkillTheSessionWroteBesideTheInstalledCorpus,
	);
	it(
		"leaves out of the recorded context manifest a skill loaded from a .claude outside the session's corpus",
		leavesOutOfTheRecordedContextManifestASkillLoadedFromAClaudeOutsideTheSessionSCorpus,
	);
	it(
		"names a declared project file's Read as a project-half entry in the recorded context manifest",
		namesADeclaredProjectFileSReadAsAProjectHalfEntryInTheRecordedContextManifest,
	);
	it(
		"names the last output_style attachment's layout path in the recorded context manifest",
		namesTheLastOutputStyleAttachmentSLayoutPathInTheRecordedContextManifest,
	);
});
