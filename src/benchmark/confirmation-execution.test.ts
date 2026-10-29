import { describe, expect, it } from "bun:test";

import { runConfirmation, runRequestedExecution } from "./confirmation";
import ControlledConfirmationReps from "./controlled-confirmation-reps-test-fixture";

const SECOND_REP_ORDINAL = 2;

const CONFIRMATION_COUNT_INCREMENT = 1;

const runRequestedExecutionLabelsAndRunsOneDebugRepWhenConfirmationIsAbsent =
	async (): Promise<void> => {
		const expectedConfirmations = 0;

		const output: string[] = [];
		let confirmations = 0;

		const result = await runRequestedExecution({
			approval: {
				output: (message) => {
					output.push(message);
				},
				prompt: async () => await Promise.resolve("no"),
			},
			confirmation: undefined,
			projectCost: () => {
				throw new Error("debug runs have no confirmation projection");
			},
			runConfirmed: async () => {
				confirmations += CONFIRMATION_COUNT_INCREMENT;
				return await Promise.resolve("confirmation result");
			},
			runDebug: async () => await Promise.resolve("debug result"),
			spendCeilingUsd: 100,
		});

		expect(result).toBe("debug result");
		expect(output).toEqual(["single-rep evidence, not a score"]);
		expect(confirmations).toBe(expectedConfirmations);
	};

const runRequestedExecutionStartsConfirmationOnlyAfterProjectedCostApproval =
	async (): Promise<void> => {
		const events: string[] = [];

		const result = await runRequestedExecution({
			approval: {
				output: (message) => {
					events.push(`output:${message}`);
				},
				prompt: async () => {
					events.push("prompt");
					return await Promise.resolve("yes");
				},
			},
			confirmation: { approval: "interactive", reps: 3 },
			projectCost: () => ({
				perRepMaximumUsd: 20,
				reps: 3,
				totalMaximumUsd: 60,
			}),
			runConfirmed: async () => {
				events.push("start");
				return await Promise.resolve("confirmation result");
			},
			runDebug: async () => await Promise.resolve("debug result"),
			spendCeilingUsd: 100,
		});

		expect(result).toBe("confirmation result");
		expect(events).toEqual([
			"output:Projected budget: $60.00 (3 reps x $20.00). Ceiling $100.00 per attempt, $300.00 for the group of 3. A session stops only after the call that crosses its budget, so the charge can exceed this.",
			"prompt",
			"start",
		]);
	};

const runConfirmationStartsIsolatedRepsTogetherFromOneFrozenInput =
	async (): Promise<void> => {
		const expectedStartedCount = 3;
		const expectedSize = 3;

		const provider = new ControlledConfirmationReps();

		const execution = runConfirmation(provider.plan(), provider.execute);

		expect(provider.started).toHaveLength(expectedStartedCount);
		expect(provider.started.map(({ repId }) => repId)).toEqual([
			"confirmation-1-rep-1",
			"confirmation-1-rep-2",
			"confirmation-1-rep-3",
		]);
		expect(
			new Set(provider.started.map(({ worktreePath }) => worktreePath)).size,
		).toBe(expectedSize);
		expect(
			provider.started.every(({ inputs }) => inputs === provider.inputs),
		).toBe(true);

		provider.releaseAll();

		expect(await execution).toEqual(
			provider.started.map((plan) => ({
				outcome: { status: "fulfilled", value: plan.repId },
				plan,
			})),
		);
	};

const runConfirmationLetsPeerRepsFinishWhenOneRejects =
	async (): Promise<void> => {
		const expectedLeadingCompletedPeerOrdinal = 1;
		const expectedTrailingCompletedPeerOrdinal = 3;

		const completed: number[] = [];

		const results = await runConfirmation(
			{
				frozenInputs: "checkpoint-1",
				groupId: "confirmation-2",
				reps: 3,
				worktreePath: (repId) => `/worktrees/${repId}`,
			},
			async (plan) => {
				if (plan.ordinal === SECOND_REP_ORDINAL) {
					throw new Error("rep failed");
				}

				await Promise.resolve();
				completed.push(plan.ordinal);

				return plan.ordinal;
			},
		);

		expect(results.map(({ outcome }) => outcome.status)).toEqual([
			"fulfilled",
			"rejected",
			"fulfilled",
		]);
		expect(completed).toEqual([
			expectedLeadingCompletedPeerOrdinal,
			expectedTrailingCompletedPeerOrdinal,
		]);
	};

describe(runRequestedExecution.name, () => {
	it(
		"labels and runs one debug rep when confirmation is absent",
		runRequestedExecutionLabelsAndRunsOneDebugRepWhenConfirmationIsAbsent,
	);

	it(
		"starts confirmation only after projected cost approval",
		runRequestedExecutionStartsConfirmationOnlyAfterProjectedCostApproval,
	);
});

describe(runConfirmation.name, () => {
	it(
		"starts isolated reps together from one frozen input",
		runConfirmationStartsIsolatedRepsTogetherFromOneFrozenInput,
	);

	it(
		"lets peer reps finish when one rejects",
		runConfirmationLetsPeerRepsFinishWhenOneRejects,
	);
});
