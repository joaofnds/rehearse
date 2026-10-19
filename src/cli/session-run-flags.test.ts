import { describe, expect, it } from "bun:test";

import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import { UsageError } from "#cli/command-usage";
import { runRunCommand } from "#cli/run-command";

import { args, loadsAuditLog, neverASession } from "./run-command-test-fixture";
import {
	SessionRequestBuilder,
	sessionCommandDependencies,
} from "./session-command-test-boundaries";

async function needsNoTerminalBecauseASessionAttemptHasNo(): Promise<void> {
	const { output, stdout } = recordOutput();

	const dependencies = sessionCommandDependencies({
		executeSession: async () =>
			await Promise.resolve({
				kind: "debug" as const,
				recordFile: "/runs/attempt.json",
			}),
		output,
	});
	await runRunCommand(new SessionRequestBuilder({}, []).build(), dependencies);

	expect(stdout.join("")).toContain("attempt.json");
}

async function refusesBeforeTheRunStartsSayingAStageS(): Promise<void> {
	const { output, stdout, stderr } = recordOutput();

	const dependencies = sessionCommandDependencies({
		execute: async () => await Promise.reject(new Error("run must not start")),
		executeSession: neverASession,
		output,
		requireCase: loadsAuditLog().requireCase,
	});
	const failure = await failureOf(
		runRunCommand(
			{
				args: [...args, "--corpus", "/some/corpus"],
				json: false,
				stdinIsTerminal: true,
			},
			dependencies,
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain("A stage's corpus is the skill it invokes");
	expect(stdout).toEqual([]);
	expect(stderr).toEqual([]);
}

describe("runRunCommand for a session case", () => {
	it.each(["--target", "--pipeline"])(
		"refuses %s as a flag a session case does not take",
		async (flag) => {
			const { output } = recordOutput();

			const dependencies = sessionCommandDependencies({
				executeSession: neverASession,
				output,
			});
			const failure = await failureOf(
				runRunCommand(
					new SessionRequestBuilder({}, [flag, "/somewhere"]).build(),
					dependencies,
				),
			);

			expect(failure).toBeInstanceOf(UsageError);
			expect(failure.message).toBe(
				`Case smoke is a session case and takes no ${flag}`,
			);
		},
	);
});

describe("runRunCommand for a session case", () => {
	it(
		"needs no terminal, because a session attempt has no review pause",
		needsNoTerminalBecauseASessionAttemptHasNo,
	);
});

describe("--corpus on a pipeline case", () => {
	it(
		"refuses before the run starts, saying a stage's corpus is its own skill",
		refusesBeforeTheRunStartsSayingAStageS,
	);
});
