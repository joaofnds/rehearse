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

function haltedSessionOutput(sessionId: string): string {
	return JSON.stringify([
		{
			mcp_servers: [{ name: "linear", status: "failed" }],
			plugins: [{ name: "compaction-judge", path: "/home/user/cj" }],
			subtype: "init",
			type: "system",
		},
		{
			message: { content: [{ text: "TRANSCRIPT_TEXT", type: "text" }] },
			type: "assistant",
		},
		{
			is_error: true,
			result: "session exhausted its budget",
			session_id: sessionId,
			total_cost_usd: 0.0012,
			type: "result",
		},
	]);
}

function haltedCommandRequest(
	projects: string,
	records: string,
): ReturnType<typeof request> {
	return request({
		projectsDirectory: projects,
		recordDirectory: records,
		runClaude: (command) => {
			const halted = haltedSessionOutput(namedSession(command));
			throw new CommandError(command, {
				exitCode: 1,
				stderr: "",
				stdout: halted,
			});
		},
	});
}

async function recordsWhatAFailedSessionReportedLoading(): Promise<void> {
	const attemptRequest = haltedCommandRequest(
		await projectsRoot(),
		await recordDirectory(),
	);

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
	const attemptRequest = haltedCommandRequest(
		await projectsRoot(),
		await recordDirectory(),
	);

	const failure = await failureOf(runSessionAttempt(attemptRequest));

	expect(failure.message).toBe("session exhausted its budget (spent $0.0012)");
	expect(JSON.stringify(failure)).not.toContain("TRANSCRIPT_TEXT");
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
});
