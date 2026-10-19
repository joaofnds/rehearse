import { describe, expect, it } from "bun:test";

import { CommandError } from "#benchmark/command";
import { runSessionAttempt } from "#benchmark/session-attempt";
import SessionInvocationError from "#benchmark/session-invocation-error";
import { budgetHaltEnvelope } from "#benchmark/test-support";
import { failureOf } from "#cli/cli-test-support";

import { request } from "./session-attempt-case-test-fixtures";
import {
	projectsRoot,
	recordDirectory,
	resources,
} from "./session-attempt-workspace-test-fixtures";

resources.registerCleanup();

const SESSION_EXAMPLES_72 = (
	[
		{
			_label: "states no failure",
			errors: undefined,
			message: "Claude session failed (spent $0.01)",
			spentUsd: 0.01,
		},
		{
			_label: "spent too little for exponent-free notation",
			errors: ["Reached maximum budget ($0.0000001)"],
			message: "Reached maximum budget ($0.0000001) (spent $0.0000001)",
			spentUsd: 1e-7,
		},
	] as const
).map(
	({ _label, errors, message, spentUsd }) =>
		[_label, errors, message, spentUsd] as const,
);
async function namesABudgetHaltSStatedErrorAndCostWhenTheCommandExitsNonZero(): Promise<void> {
	const halt = await budgetHaltEnvelope();

	const attemptRequest = request({
		projectsDirectory: await projectsRoot(),
		recordDirectory: await recordDirectory(),
		runClaude: (command) => {
			throw new CommandError(command, {
				exitCode: 1,
				stderr: "",
				stdout: halt,
			});
		},
	});

	const failure = await failureOf(runSessionAttempt(attemptRequest));

	expect(failure).toBeInstanceOf(SessionInvocationError);
	expect(failure).toMatchObject({
		attempt: {
			metrics: { costUsd: 0.5782854 },
			outcome: "EXECUTION_FAILED",
		},
		message: "Reached maximum budget ($0.2853308) (spent $0.5782854)",
	});
}

async function keepsAHaltedCommandSStderrOnItsOwnLineAfterTheStatedError(): Promise<void> {
	const halt = await budgetHaltEnvelope();

	const attemptRequest = request({
		projectsDirectory: await projectsRoot(),
		recordDirectory: await recordDirectory(),
		runClaude: (command) => {
			throw new CommandError(command, {
				exitCode: 1,
				stderr: "hook exited 2\n",
				stdout: halt,
			});
		},
	});

	const failure = await failureOf(runSessionAttempt(attemptRequest));

	expect(failure.message).toBe(
		"Reached maximum budget ($0.2853308) (spent $0.5782854)\nhook exited 2",
	);
}

async function addsTheSpendOnceToAFailedCommandThatStatesNoFailure(): Promise<void> {
	const expectedSplitCount = 2;

	const unstated = JSON.stringify({
		is_error: true,
		session_id: "session-1",
		total_cost_usd: 0.01,
	});
	let rejected = new Error("the runner was never called");

	const attemptRequest = request({
		projectsDirectory: await projectsRoot(),
		recordDirectory: await recordDirectory(),
		runClaude: (command) => {
			rejected = new CommandError(command, {
				exitCode: 1,
				stderr: "socket closed\n",
				stdout: unstated,
			});
			throw rejected;
		},
	});

	const failure = await failureOf(runSessionAttempt(attemptRequest));

	expect(failure.message).toBe(`${rejected.message} (spent $0.01)`);
	expect(failure.message.split("socket closed")).toHaveLength(
		expectedSplitCount,
	);
}

async function namesABudgetHaltSStatedErrorAndCostWhenTheCommandExits0(): Promise<void> {
	const halt = await budgetHaltEnvelope();

	const attemptRequest = request({
		projectsDirectory: await projectsRoot(),
		recordDirectory: await recordDirectory(),
		runClaude: async () => await Promise.resolve(halt),
	});

	const failure = await failureOf(runSessionAttempt(attemptRequest));

	expect(failure).toBeInstanceOf(SessionInvocationError);
	expect(failure).toMatchObject({
		attempt: {
			metrics: { costUsd: 0.5782854 },
			outcome: "EXECUTION_FAILED",
		},
		message: "Reached maximum budget ($0.2853308) (spent $0.5782854)",
	});
}
describe(runSessionAttempt.name, () => {
	it(
		"names a budget halt's stated error and cost when the command exits non-zero",
		namesABudgetHaltSStatedErrorAndCostWhenTheCommandExitsNonZero,
	);
	it(
		"keeps a halted command's stderr on its own line after the stated error",
		keepsAHaltedCommandSStderrOnItsOwnLineAfterTheStatedError,
	);
	it(
		"adds the spend once to a failed command that states no failure",
		addsTheSpendOnceToAFailedCommandThatStatesNoFailure,
	);
	it(
		"names a budget halt's stated error and cost when the command exits 0",
		namesABudgetHaltSStatedErrorAndCostWhenTheCommandExits0,
	);
	it.each(SESSION_EXAMPLES_72)(
		"names a failed session's spend when its envelope %s",
		async (...[_label, errors, message, spentUsd]) => {
			const attemptRequest = request({
				projectsDirectory: await projectsRoot(),
				recordDirectory: await recordDirectory(),
				runClaude: async () =>
					await Promise.resolve(
						JSON.stringify({
							errors,
							is_error: true,
							session_id: "session-1",
							total_cost_usd: spentUsd,
						}),
					),
			});

			const failure = await failureOf(runSessionAttempt(attemptRequest));

			expect(failure).toBeInstanceOf(SessionInvocationError);
			expect(failure.message).toBe(message);
		},
	);
});
