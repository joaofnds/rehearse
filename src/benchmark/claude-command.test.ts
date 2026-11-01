import { describe, expect, it } from "bun:test";

import { failureOf } from "#cli/cli-test-support";

import {
	ClaudeSessionError,
	readStreamResult,
	runJsonSession,
	runStreamedSession,
} from "./claude";
import {
	STREAM_RESULT_LINE,
	STREAM_SUCCESS_EXIT_CODE,
	init,
	partial,
	printing,
} from "./claude-test-fixtures";
import { CommandError } from "./command";
import markTestProcessConfined from "./confined-session-test-fixture";
import { budgetHaltEnvelope, haltingCommand } from "./test-support";

markTestProcessConfined();

function returnsTheFinalStreamResult(): void {
	const result = JSON.stringify({
		structured_output: { answer: "ship it" },
		total_cost_usd: 0.2,
		type: "result",
	});
	const output = [
		JSON.stringify({ subtype: "init", type: "system" }),
		JSON.stringify({ event: { type: "message_stop" }, type: "stream_event" }),
		result,
		"",
	].join("\n");

	expect(readStreamResult(output)).toBe(result);
}

function rejectsAStreamThatEndedWithoutAResult(): void {
	expect(() =>
		readStreamResult(JSON.stringify({ subtype: "init", type: "system" })),
	).toThrow("Claude stream ended without a result");
}

async function handsEachLineOnAndResolvesToTheResultLine(): Promise<void> {
	const lines: string[] = [];

	const output = await runStreamedSession(
		printing(STREAM_SUCCESS_EXIT_CODE),
		process.cwd(),
		{
			onLine: (line) => {
				lines.push(line);
			},
		},
	);

	expect(output).toBe(STREAM_RESULT_LINE);
	expect(lines.filter((line) => line !== "")).toEqual([
		init,
		partial,
		STREAM_RESULT_LINE,
	]);
}

function reportsAResultLineThatIsNoSessionEnvelopeAsACommandFailureCarryingThatLineAlone(): void {
	const notAnEnvelope = '{"type":"result","is_error":true}';

	expect(
		runStreamedSession(
			["sh", "-c", `printf '%s\\n' "$0" "$1"; exit 3`, init, notAnEnvelope],
			process.cwd(),
		),
	).rejects.toThrow(
		/^Command failed \(3\)[^\n]*\n\{"type":"result","is_error":true\}$/u,
	);
}

async function reportsASessionTheCLIHaltedMidStreamAsASessionErrorNamingItsErrorsAndSpend(): Promise<void> {
	const halt = await budgetHaltEnvelope();

	const failure = await failureOf(
		runStreamedSession(
			[
				"sh",
				"-c",
				`printf '%s\\n' "$0" "$1" "$2"; exit 1`,
				init,
				partial,
				halt,
			],
			process.cwd(),
		),
	);

	expect(failure).toBeInstanceOf(ClaudeSessionError);
	expect(failure).toMatchObject({
		costUsd: 0.5782854,
		message: "Reached maximum budget ($0.2853308)",
		terminalReason: "budget_exhausted",
	});
}

async function reportsASessionTheCLIHaltedAsASessionErrorCarryingItsSpend(): Promise<void> {
	const halt = await budgetHaltEnvelope();

	const failure = await failureOf(
		runJsonSession(haltingCommand(halt), process.cwd()),
	);

	expect(failure).toBeInstanceOf(ClaudeSessionError);
	expect(failure).toMatchObject({
		costUsd: 0.5782854,
		terminalReason: "budget_exhausted",
	});
}

async function keepsTheCommandSDiagnosticsWhenAHaltedSessionStatesNoErrors(): Promise<void> {
	const halt = JSON.stringify({
		is_error: true,
		session_id: "halted-session",
		total_cost_usd: 0.1,
	});

	const failure = await failureOf(
		runJsonSession(
			[
				"sh",
				"-c",
				`printf '%s' "$0"; echo "$1" >&2; exit 1`,
				halt,
				"socket closed",
			],
			process.cwd(),
		),
	);

	expect(failure).toBeInstanceOf(ClaudeSessionError);
	expect(failure.message).toContain("socket closed");
}

function reportsAFailedCommandWithNoEnvelopeAsACommandFailure(): void {
	expect(
		runJsonSession(haltingCommand("claude: not logged in"), process.cwd()),
	).rejects.toBeInstanceOf(CommandError);
}

describe(readStreamResult.name, () => {
	it(
		"returns the result line of a streamed session, the json envelope's shape",
		returnsTheFinalStreamResult,
	);
	it(
		"rejects a stream that ended without a result",
		rejectsAStreamThatEndedWithoutAResult,
	);
});
describe(runStreamedSession.name, () => {
	it(
		"hands each line on and resolves to the result line",
		handsEachLineOnAndResolvesToTheResultLine,
	);
	it(
		"reports a result line that is no session envelope as a command failure carrying that line alone",
		reportsAResultLineThatIsNoSessionEnvelopeAsACommandFailureCarryingThatLineAlone,
	);
	it(
		"reports a session the CLI halted mid-stream as a session error naming its errors and spend",
		reportsASessionTheCLIHaltedMidStreamAsASessionErrorNamingItsErrorsAndSpend,
	);
});
describe(runJsonSession.name, () => {
	it(
		"reports a session the CLI halted as a session error carrying its spend",
		reportsASessionTheCLIHaltedAsASessionErrorCarryingItsSpend,
	);
	it(
		"keeps the command's diagnostics when a halted session states no errors",
		keepsTheCommandSDiagnosticsWhenAHaltedSessionStatesNoErrors,
	);
	it(
		"reports a failed command with no envelope as a command failure",
		reportsAFailedCommandWithNoEnvelopeAsACommandFailure,
	);
});
