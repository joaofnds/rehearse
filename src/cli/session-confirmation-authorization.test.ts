import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { parseConfirmationGroupRecord } from "#benchmark/confirmation-record";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { TestResources } from "#benchmark/test-support";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import { executeSessionRun, runRunCommand } from "#cli/run-command";

import {
	DEBUG_EXECUTION_EVENT_COUNT,
	PREFIX_START_INDEX,
	missingPreflight,
	neverASession,
} from "./run-command-test-fixture";
import {
	SessionRequestBuilder,
	observedConfirmationDependencies,
	recordSuccessfulSessionAttempt,
	sessionCommandDependencies,
} from "./session-command-test-boundaries";

class SessionCommandEvents {
	readonly #events: string[] = [];
	public record(event: string): void {
		this.#events.push(event);
	}
	public values(): readonly string[] {
		return [...this.#events];
	}
}

const STORED_SPEND_CEILING_BELOW_THE_SESSION_BUDGET_USD = 0.15;

const testResources = TestResources.forEachTest();

async function readConfirmationGroup(
	runsDirectory: string,
): Promise<ReturnType<typeof parseConfirmationGroupRecord>> {
	const [groupId] = await readdir(join(runsDirectory, "confirmations"));

	return parseConfirmationGroupRecord(
		await Bun.file(
			join(runsDirectory, "confirmations", groupId ?? "missing", "group.json"),
		).text(),
	);
}

async function approvesTheWholeConfirmedCommandBeforeTheModelProbe(): Promise<void> {
	const { output } = recordOutput();
	const runsDirectory = await testResources.createControlDirectory();
	const events = new SessionCommandEvents();
	const dependencies = observedConfirmationDependencies({
		events,
		executeSession: async (execution, boundary) =>
			await executeSessionRun(execution, {
				...boundary,
				executeAttempt: async (plan) => {
					events.record(`rep:${String(plan.ordinal)}`);
					return await recordSuccessfulSessionAttempt(plan);
				},
				runDebug: async () =>
					await Promise.reject(new Error("debug attempt must not start")),
				runsDirectory,
			}),
		output,
	});

	await runRunCommand(
		new SessionRequestBuilder({}, [
			"--confirm",
			"--reps",
			"2",
			"--yes",
		]).build(),
		dependencies,
	);

	expect(
		events.values().slice(PREFIX_START_INDEX, DEBUG_EXECUTION_EVENT_COUNT),
	).toEqual([
		"output:Projected budget: $0.50 ($0.10 preflight + 2 reps x $0.20). Ceiling $100.00 per attempt, $200.00 for the group of 2. A session stops only after the call that crosses its budget, so the charge can exceed this.",
		"probe",
		"rep:1",
		"rep:2",
	]);
	const group = await readConfirmationGroup(runsDirectory);

	expect(group.projectedCost).toEqual({
		perRepMaximumUsd: 0.2,
		preflightMaximumUsd: 0.1,
		reps: 2,
		totalMaximumUsd: 0.5,
	});
}

async function holdsEachAttemptToAStoredSpendCeilingBelowItsSessionBudget(): Promise<void> {
	const { output } = recordOutput();
	const runsDirectory = await testResources.createControlDirectory();
	const events = new SessionCommandEvents();
	const dependencies = {
		...observedConfirmationDependencies({
			events,
			executeSession: async (execution, boundary) =>
				await executeSessionRun(execution, {
					...boundary,
					executeAttempt: recordSuccessfulSessionAttempt,
					runDebug: async () =>
						await Promise.reject(new Error("debug attempt must not start")),
					runsDirectory,
				}),
			output,
		}),
		requireSpendCeiling: async () =>
			await Promise.resolve(STORED_SPEND_CEILING_BELOW_THE_SESSION_BUDGET_USD),
	};

	await runRunCommand(
		new SessionRequestBuilder({}, [
			"--confirm",
			"--reps",
			"2",
			"--yes",
		]).build(),
		dependencies,
	);

	expect(events.values()[PREFIX_START_INDEX]).toBe(
		"output:Projected budget: $0.40 ($0.10 preflight + 2 reps x $0.15). Ceiling $0.15 per attempt, $0.30 for the group of 2. A session stops only after the call that crosses its budget, so the charge can exceed this.",
	);
	const group = await readConfirmationGroup(runsDirectory);

	expect(group.projectedCost).toEqual({
		perRepMaximumUsd: 0.15,
		preflightMaximumUsd: 0.1,
		reps: 2,
		totalMaximumUsd: 0.4,
	});
}

async function haltsBeforeTheSessionAttemptWhenTheDeclaredModel(): Promise<void> {
	const { output } = recordOutput();

	const dependencies = sessionCommandDependencies({
		executeSession: async (execution, boundary) =>
			await executeSessionRun(execution, {
				...boundary,
				runDebug: async () =>
					await Promise.reject(new Error("a session attempt must not start")),
			}),
		output,
		probeModel: async () =>
			await Promise.reject(
				new RefusedPreconditionError("Model haiku is not available"),
			),
	});
	const failure = await failureOf(
		runRunCommand(new SessionRequestBuilder({}, []).build(), dependencies),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
}

async function refusesConfirmationWithoutATerminalBeforeProbingTheModel(): Promise<void> {
	const { output } = recordOutput();
	const probes: string[] = [];

	const dependencies = sessionCommandDependencies({
		executeSession: neverASession,
		output,
		probeModel: async (model) => {
			probes.push(model);

			return await Promise.resolve(missingPreflight);
		},
	});
	const failure = await failureOf(
		runRunCommand(
			new SessionRequestBuilder({}, ["--confirm", "--reps", "2"]).build(),
			dependencies,
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(probes).toEqual([]);
}

describe("runRunCommand for a session case", () => {
	it(
		"approves the whole confirmed command before the model probe and reps",
		approvesTheWholeConfirmedCommandBeforeTheModelProbe,
	);
	it(
		"holds each attempt to a stored spend ceiling below its session budget",
		holdsEachAttemptToAStoredSpendCeilingBelowItsSessionBudget,
	);
	it(
		"halts before the session attempt when the declared model is not available",
		haltsBeforeTheSessionAttemptWhenTheDeclaredModel,
	);
	it(
		"refuses confirmation without a terminal before probing the model",
		refusesConfirmationWithoutATerminalBeforeProbingTheModel,
	);
});
