import { describe, expect, it } from "bun:test";
import { readdir, realpath } from "node:fs/promises";
import { join } from "node:path";

import { runSessionAttempt } from "#benchmark/session-attempt";
import { projectSlug } from "#benchmark/session-capture";
import SessionInvocationError from "#benchmark/session-invocation-error";
import { failureOf } from "#cli/cli-test-support";

import { request } from "./session-attempt-case-test-fixtures";
import {
	SUB_AGENT_FILES,
	claudeWithSubagents,
	registerSubagentFixtureCleanup,
	retainedSubagentFiles,
	writeSubagentFiles,
} from "./session-attempt-subagent-test-fixtures";
import {
	projectsRoot,
	recordDirectory,
	resources,
} from "./session-attempt-workspace-test-fixtures";

registerSubagentFixtureCleanup();
resources.registerCleanup();

async function copiesEachSubAgentSTranscriptAndMetaFileBesideTheAttemptSTranscriptAndLeavesTheProjectsSlugEmpty(): Promise<void> {
	const projects = await projectsRoot();
	const records = await recordDirectory();

	const attempt = await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: records,
			runClaude: claudeWithSubagents(projects, writeSubagentFiles),
		}),
	);

	expect(await retainedSubagentFiles(records)).toEqual(SUB_AGENT_FILES);
	const slug = join(projects, projectSlug(attempt.attemptDirectory));
	expect(await readdir(slug).catch(() => [])).toEqual([]);
}

async function copiesTheSubAgentFilesOfASessionWhoseProviderCommandFailedAndLeavesTheProjectsSlugEmpty(): Promise<void> {
	const projects = await projectsRoot();
	const records = await recordDirectory();
	const session = claudeWithSubagents(projects, writeSubagentFiles);
	let slug = "";

	const failure = await failureOf(
		runSessionAttempt(
			request({
				projectsDirectory: projects,
				recordDirectory: records,
				runClaude: async (command, cwd) => {
					slug = join(projects, projectSlug(await realpath(cwd)));
					await session(command, cwd);

					throw new Error("claude exited 1");
				},
			}),
		),
	);

	expect(failure).toBeInstanceOf(SessionInvocationError);
	expect(await retainedSubagentFiles(records)).toEqual(SUB_AGENT_FILES);
	expect(await readdir(slug).catch(() => [])).toEqual([]);
}

describe("the sub-agent evidence a session attempt retains", () => {
	it(
		"copies each sub-agent's transcript and meta file beside the attempt's transcript and leaves the projects slug empty",
		copiesEachSubAgentSTranscriptAndMetaFileBesideTheAttemptSTranscriptAndLeavesTheProjectsSlugEmpty,
	);
	it(
		"copies the sub-agent files of a session whose provider command failed and leaves the projects slug empty",
		copiesTheSubAgentFilesOfASessionWhoseProviderCommandFailedAndLeavesTheProjectsSlugEmpty,
	);
});
