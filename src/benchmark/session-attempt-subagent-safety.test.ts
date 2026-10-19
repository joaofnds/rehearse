import { describe, expect, it } from "bun:test";
import { chmod, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { runSessionAttempt } from "#benchmark/session-attempt";

import { request } from "./session-attempt-case-test-fixtures";
import { claudeWriting } from "./session-attempt-provider-test-fixtures";
import {
	EXECUTABLE_FILE_MODE,
	SUB_AGENT_FILES,
	UNREADABLE_FILE_MODE,
	claudeWithSubagents,
	locked,
	registerSubagentFixtureCleanup,
	retainedSubagentFiles,
	writeSubagentFiles,
} from "./session-attempt-subagent-test-fixtures";
import { agentResultLine } from "./session-attempt-transcript-test-fixtures";
import {
	projectsRoot,
	recordDirectory,
	resources,
} from "./session-attempt-workspace-test-fixtures";

registerSubagentFixtureCleanup();
resources.registerCleanup();

async function copiesNeitherASymlinkNorAFileUnderAnotherName(): Promise<void> {
	const projects = await projectsRoot();
	const records = await recordDirectory();

	await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: records,
			runClaude: claudeWithSubagents(projects, async (subagents) => {
				await writeSubagentFiles(subagents);
				await symlink("/etc/hosts", join(subagents, "agent-a2.jsonl"));
				await writeFile(join(subagents, "notes.txt"), "planted\n");
				await writeFile(join(subagents, "agent-a3.json"), "{}\n");
				await writeFile(join(subagents, "agent-a4.jsonl.tmp"), "{}\n");
				await writeFile(join(subagents, "xagent-a5.jsonl"), "{}\n");
			}),
		}),
	);

	expect(await retainedSubagentFiles(records)).toEqual(SUB_AGENT_FILES);
}

async function keepsTheRecordNamesTheAgentsItCouldNotCopyAndLeavesTheProviderSFilesInPlace(): Promise<void> {
	const projects = await projectsRoot();
	let subagentDirectory = "";

	const attemptRequest = request({
		projectsDirectory: projects,
		recordDirectory: await recordDirectory(),
		runClaude: claudeWithSubagents(
			projects,
			async (subagents) => {
				await writeSubagentFiles(subagents);
				await chmod(subagents, UNREADABLE_FILE_MODE);
				locked.push(subagents);
				subagentDirectory = subagents;
			},
			claudeWriting(
				projects,
				(sessionId) => [agentResultLine(sessionId, "a1")],
				"OK",
			),
		),
	});
	const attempt = await runSessionAttempt(attemptRequest);

	expect(attempt.unavailableSubagents).toEqual(["a1"]);
	await chmod(subagentDirectory, EXECUTABLE_FILE_MODE);
	const left = await readdir(subagentDirectory);
	expect(left.toSorted()).toEqual(Object.keys(SUB_AGENT_FILES));
}

async function copiesTheFilesItCanReadAndLeavesTheProviderSFilesInPlace(): Promise<void> {
	const projects = await projectsRoot();
	const records = await recordDirectory();
	let unreadable = "";

	const attemptRequest = request({
		projectsDirectory: projects,
		recordDirectory: records,
		runClaude: claudeWithSubagents(
			projects,
			async (subagents) => {
				await writeSubagentFiles(subagents);
				unreadable = join(subagents, "agent-a1.jsonl");
				await chmod(unreadable, UNREADABLE_FILE_MODE);
				locked.push(unreadable);
			},
			claudeWriting(
				projects,
				(sessionId) => [agentResultLine(sessionId, "a1")],
				"OK",
			),
		),
	});
	const attempt = await runSessionAttempt(attemptRequest);

	expect(attempt.unavailableSubagents).toEqual(["a1"]);
	expect(await retainedSubagentFiles(records)).toEqual({
		"agent-a1.meta.json": SUB_AGENT_FILES["agent-a1.meta.json"],
	});
	expect(await Bun.file(unreadable).exists()).toBe(true);
}

async function copiesNothingThroughItAndLeavesWhatItPointsAtInPlace(): Promise<void> {
	const projects = await projectsRoot();
	const records = await recordDirectory();
	const elsewhere = await recordDirectory();
	await writeSubagentFiles(elsewhere);

	const attemptRequest = request({
		projectsDirectory: projects,
		recordDirectory: records,
		runClaude: claudeWithSubagents(
			projects,
			async (subagents) => {
				await rm(subagents, { recursive: true });
				await symlink(elsewhere, subagents);
			},
			claudeWriting(
				projects,
				(sessionId) => [agentResultLine(sessionId, "a1")],
				"OK",
			),
		),
	});
	const attempt = await runSessionAttempt(attemptRequest);

	expect(attempt.unavailableSubagents).toEqual(["a1"]);
	expect(await Bun.file(join(records, "subagents")).exists()).toBe(false);
	const pointedAt = await readdir(elsewhere);
	expect(pointedAt.toSorted()).toEqual(Object.keys(SUB_AGENT_FILES));
}
describe("the sub-agent evidence a session attempt retains", () => {
	describe("when the session's sub-agent directory holds more than the provider's files", () => {
		it(
			"copies neither a symlink nor a file under another name",
			copiesNeitherASymlinkNorAFileUnderAnotherName,
		);
	});
	describe("when the session's sub-agent files cannot be read", () => {
		it(
			"keeps the record, names the agents it could not copy, and leaves the provider's files in place",
			keepsTheRecordNamesTheAgentsItCouldNotCopyAndLeavesTheProviderSFilesInPlace,
		);
		it(
			"copies the files it can read and leaves the provider's files in place",
			copiesTheFilesItCanReadAndLeavesTheProviderSFilesInPlace,
		);
	});
	describe("when the session's sub-agent directory is a symlink", () => {
		it(
			"copies nothing through it and leaves what it points at in place",
			copiesNothingThroughItAndLeavesWhatItPointsAtInPlace,
		);
	});
});
