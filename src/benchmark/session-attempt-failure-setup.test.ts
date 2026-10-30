import { describe, expect, it } from "bun:test";

import { CommandError } from "#benchmark/command";
import { runSessionAttempt } from "#benchmark/session-attempt";
import { failureOf } from "#cli/cli-test-support";

import { request } from "./session-attempt-case-test-fixtures";
import { namedSession } from "./session-attempt-provider-test-fixtures";
import {
	projectsRoot,
	recordDirectory,
	resources,
} from "./session-attempt-workspace-test-fixtures";

resources.registerCleanup();

const INIT = JSON.stringify({
	cwd: "/home/user/INIT_VALUE",
	mcp_servers: [{ name: "linear", status: "failed" }],
	plugins: [{ name: "compaction-judge", path: "/home/user/INIT_VALUE" }],
	subtype: "init",
	type: "system",
});

const ASSISTANT = JSON.stringify({
	message: { content: [{ text: "TRANSCRIPT_TEXT", type: "text" }] },
	type: "assistant",
});

function haltedSessionOutput(sessionId: string): string {
	const result = JSON.stringify({
		is_error: true,
		result: "session exhausted its budget",
		session_id: sessionId,
		total_cost_usd: 0.0012,
		type: "result",
	});

	return [INIT, ASSISTANT, result].join("\n");
}

function failedCommandRequest(
	projects: string,
	records: string,
	stdout: (sessionId: string) => string,
): ReturnType<typeof request> {
	return request({
		projectsDirectory: projects,
		recordDirectory: records,
		runClaude: (command) => {
			throw new CommandError(command, {
				exitCode: 1,
				stderr: "",
				stdout: stdout(namedSession(command)),
			});
		},
	});
}

async function haltedCommandRequest(): Promise<ReturnType<typeof request>> {
	return failedCommandRequest(
		await projectsRoot(),
		await recordDirectory(),
		haltedSessionOutput,
	);
}

async function recordsWhatAFailedSessionReportedLoading(): Promise<void> {
	const attemptRequest = await haltedCommandRequest();

	const failure = await failureOf(runSessionAttempt(attemptRequest));

	expect(failure).toMatchObject({
		attempt: {
			setup: {
				loaded: {
					mcpServers: [{ name: "linear", status: "failed" }],
					plugins: ["compaction-judge"],
				},
			},
		},
	});
}

async function namesAFailedSessionSFailureWithoutItsTranscriptMessages(): Promise<void> {
	const attemptRequest = await haltedCommandRequest();

	const failure = await failureOf(runSessionAttempt(attemptRequest));

	expect(failure.message).toBe("session exhausted its budget (spent $0.0012)");
	expect(JSON.stringify(failure)).not.toContain("TRANSCRIPT_TEXT");
}

async function namesASessionCutOffBeforeItsResultWithoutItsMessages(): Promise<void> {
	const attemptRequest = failedCommandRequest(
		await projectsRoot(),
		await recordDirectory(),
		() => [INIT, ASSISTANT].join("\n"),
	);

	const failure = await failureOf(runSessionAttempt(attemptRequest));

	expect(failure.message).not.toContain("INIT_VALUE");
	expect(failure.message).not.toContain("TRANSCRIPT_TEXT");
}

async function keepsAFailedCommandSPlainTextOutputInItsMessage(): Promise<void> {
	const attemptRequest = failedCommandRequest(
		await projectsRoot(),
		await recordDirectory(),
		() => "Error: Invalid API key",
	);

	const failure = await failureOf(runSessionAttempt(attemptRequest));

	expect(failure.message).toContain("Error: Invalid API key");
}

describe(runSessionAttempt.name, () => {
	it(
		"records what a failed session reported loading",
		recordsWhatAFailedSessionReportedLoading,
	);
	it(
		"names a failed session's failure without its transcript messages",
		namesAFailedSessionSFailureWithoutItsTranscriptMessages,
	);
	it(
		"names a session cut off before its result without its messages",
		namesASessionCutOffBeforeItsResultWithoutItsMessages,
	);
	it(
		"keeps a failed command's plain-text output in its message",
		keepsAFailedCommandSPlainTextOutputInItsMessage,
	);
});
