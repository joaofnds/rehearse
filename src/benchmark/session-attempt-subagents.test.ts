import { describe, expect, it } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { runSessionAttempt } from "#benchmark/session-attempt";
import { failureOf } from "#cli/cli-test-support";

import { SOURCE_SESSION, request } from "./session-attempt-case-test-fixtures";
import {
	appendingClaude,
	claudeWriting,
} from "./session-attempt-provider-test-fixtures";
import {
	claudeWithSubagents,
	registerSubagentFixtureCleanup,
	writeSubagentFiles,
} from "./session-attempt-subagent-test-fixtures";
import {
	agentResultLine,
	forkedSkillResultLine,
} from "./session-attempt-transcript-test-fixtures";
import {
	projectsRoot,
	recordDirectory,
	resources,
	resumingCase,
	writtenPrefix,
} from "./session-attempt-workspace-test-fixtures";

registerSubagentFixtureCleanup();
resources.registerCleanup();

async function recordsEachAgentAnAgentOrForkedSkillResultNamesWithoutATranscriptAsUnavailable(): Promise<void> {
	const projects = await projectsRoot();

	const attemptRequest = request({
		projectsDirectory: projects,
		recordDirectory: await recordDirectory(),
		runClaude: claudeWithSubagents(
			projects,
			writeSubagentFiles,
			claudeWriting(
				projects,
				(sessionId) => [
					agentResultLine(sessionId, "a1"),
					agentResultLine(sessionId, "a4"),
					forkedSkillResultLine(sessionId, "a5"),
				],
				"OK",
			),
		),
	});
	const attempt = await runSessionAttempt(attemptRequest);

	expect(attempt.unavailableSubagents).toEqual(["a4", "a5"]);
}

async function recordsAnAgentWhoseIdCouldNotNameAFileAsUnavailableWithoutLookingOutsideTheRecord(): Promise<void> {
	const projects = await projectsRoot();
	const records = await recordDirectory();
	await writeFile(join(records, "escaped.jsonl"), "{}\n");

	const attemptRequest = request({
		projectsDirectory: projects,
		recordDirectory: records,
		runClaude: claudeWithSubagents(
			projects,
			async (subagents) => {
				await mkdir(join(subagents, "agent-x"));
			},
			claudeWriting(
				projects,
				(sessionId) => [agentResultLine(sessionId, "x/../../escaped")],
				"OK",
			),
		),
	});
	const attempt = await runSessionAttempt(attemptRequest);

	expect(attempt.unavailableSubagents).toEqual(["x/../../escaped"]);
}

async function recordsTheUnavailableAgentsOfASessionWhoseProviderCommandFailed(): Promise<void> {
	const projects = await projectsRoot();
	const session = claudeWriting(
		projects,
		(sessionId) => [agentResultLine(sessionId, "a4")],
		"OK",
	);

	const attemptRequest = request({
		projectsDirectory: projects,
		recordDirectory: await recordDirectory(),
		runClaude: async (command, cwd) => {
			await session(command, cwd);

			throw new Error("claude exited 1");
		},
	});
	const failure = await failureOf(runSessionAttempt(attemptRequest));

	expect(failure).toMatchObject({
		attempt: { outcome: "EXECUTION_FAILED", unavailableSubagents: ["a4"] },
	});
}

async function doesNotCountAnAgentNamedInTheInheritedPrefixAsUnavailable(): Promise<void> {
	const prefix = await writtenPrefix(
		`${agentResultLine(SOURCE_SESSION, "a0")}\n`,
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

	expect(attempt.unavailableSubagents).toEqual([]);
}

async function doesNotCountAnAgentNamedInTheInheritedPrefixAsUnavailableWhenTheProviderCommandFailed(): Promise<void> {
	const prefix = await writtenPrefix(
		`${agentResultLine(SOURCE_SESSION, "a0")}\n`,
	);
	const projects = await projectsRoot();
	const session = appendingClaude(projects, "OK");

	const attemptRequest = request({
		projectsDirectory: projects,
		recordDirectory: await recordDirectory(),
		runClaude: async (command, cwd) => {
			await session(command, cwd);

			throw new Error("claude exited 1");
		},
		sessionCase: resumingCase(prefix.path, prefix.sha256),
	});
	const failure = await failureOf(runSessionAttempt(attemptRequest));

	expect(failure).toMatchObject({
		attempt: { outcome: "EXECUTION_FAILED", unavailableSubagents: [] },
	});
}

describe("the sub-agent evidence a session attempt retains", () => {
	it(
		"records each agent an Agent or forked Skill result names without a transcript as unavailable",
		recordsEachAgentAnAgentOrForkedSkillResultNamesWithoutATranscriptAsUnavailable,
	);
	it(
		"records an agent whose id could not name a file as unavailable without looking outside the record",
		recordsAnAgentWhoseIdCouldNotNameAFileAsUnavailableWithoutLookingOutsideTheRecord,
	);
	it(
		"records the unavailable agents of a session whose provider command failed",
		recordsTheUnavailableAgentsOfASessionWhoseProviderCommandFailed,
	);
	it(
		"does not count an agent named in the inherited prefix as unavailable",
		doesNotCountAnAgentNamedInTheInheritedPrefixAsUnavailable,
	);
	it(
		"does not count an agent named in the inherited prefix as unavailable when the provider command failed",
		doesNotCountAnAgentNamedInTheInheritedPrefixAsUnavailableWhenTheProviderCommandFailed,
	);
});
