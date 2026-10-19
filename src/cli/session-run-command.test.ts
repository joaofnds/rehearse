import { describe, expect, it } from "bun:test";

import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import { executeSessionRun, runRunCommand } from "#cli/run-command";

import {
	STORED_SPEND_CEILING_USD,
	missingPreflight,
	resumedSmokeCase,
} from "./run-command-test-fixture";
import {
	SessionRequestBuilder,
	sessionCommandDependencies,
} from "./session-command-test-boundaries";

async function runsTheSessionAttemptAndPrintsItsRecordPath(): Promise<void> {
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

	expect(stdout.join("")).toBe("/runs/attempt.json\n");
}

async function holdsASessionAttemptSBudgetToTheStored(): Promise<void> {
	const budgets: number[] = [];
	const ceilings: number[] = [];

	const dependencies = sessionCommandDependencies({
		executeSession: async ({ config }, boundary) => {
			budgets.push(config.sessionBudgetUsd);
			ceilings.push(boundary.spendCeilingUsd);

			return await Promise.resolve({
				kind: "debug" as const,
				recordFile: "/runs/attempt.json",
			});
		},
		output: recordOutput().output,
		requireSpendCeiling: async () =>
			await Promise.resolve(STORED_SPEND_CEILING_USD),
	});
	await runRunCommand(
		{
			args: [
				"--case",
				"smoke",
				"--model",
				"haiku",
				"--session-budget-usd",
				"5",
			],
			json: false,
			stdinIsTerminal: false,
		},
		dependencies,
	);

	expect({ budgets, ceilings }).toEqual({
		budgets: [STORED_SPEND_CEILING_USD],
		ceilings: [STORED_SPEND_CEILING_USD],
	});
}

async function refusesAnUnsupportedResumedSessionBeforeTheModelProbe(): Promise<void> {
	const { output } = recordOutput();
	const paidCalls: string[] = [];

	const dependencies = sessionCommandDependencies({
		executeSession: async (execution, boundary) =>
			await executeSessionRun(execution, {
				...boundary,
				assertSystemPromptSnapshotSupported: async () => {
					await Promise.reject(
						new RefusedPreconditionError(
							"Claude does not support prompt snapshot control",
						),
					);
				},
				runDebug: async () => {
					paidCalls.push("attempt");

					return await Promise.reject(new Error("must not run"));
				},
			}),
		output,
		probeModel: async () => {
			paidCalls.push("probe");

			return await Promise.resolve(missingPreflight);
		},
		requireCase: async () => await Promise.resolve(resumedSmokeCase),
	});
	const failure = await failureOf(
		runRunCommand(new SessionRequestBuilder({}, []).build(), dependencies),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(paidCalls).toEqual([]);
}

async function checksASupportedResumedSessionBeforeItsModelProbe(): Promise<void> {
	const { output } = recordOutput();
	const events: string[] = [];

	const dependencies = sessionCommandDependencies({
		executeSession: async (execution, boundary) =>
			await executeSessionRun(execution, {
				...boundary,
				assertSystemPromptSnapshotSupported: async () => {
					events.push("capability");

					await Promise.resolve();
				},
				runDebug: async () => {
					events.push("attempt");

					return await Promise.reject(new Error("attempt reached"));
				},
			}),
		output,
		probeModel: async () => {
			events.push("probe");

			return await Promise.resolve(missingPreflight);
		},
		requireCase: async () => await Promise.resolve(resumedSmokeCase),
	});
	const failure = await failureOf(
		runRunCommand(new SessionRequestBuilder({}, []).build(), dependencies),
	);

	expect(failure.message).toBe("attempt reached");
	expect(events).toEqual(["capability", "probe", "attempt"]);
}

describe("runRunCommand for a session case", () => {
	it(
		"runs the session attempt and prints its record path",
		runsTheSessionAttemptAndPrintsItsRecordPath,
	);
	it(
		"holds a session attempt's budget to the stored spend ceiling and carries the ceiling to its record",
		holdsASessionAttemptSBudgetToTheStored,
	);
	it(
		"refuses an unsupported resumed session before the model probe",
		refusesAnUnsupportedResumedSessionBeforeTheModelProbe,
	);
	it(
		"checks a supported resumed session before its model probe and attempt",
		checksASupportedResumedSessionBeforeItsModelProbe,
	);
});
