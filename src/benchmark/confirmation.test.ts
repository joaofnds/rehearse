import { describe, expect, it } from "bun:test";
import type { ConfirmationRepPlan } from "./confirmation";
import {
	formatProjectedCost,
	projectConfirmationCost,
	requireConfirmationApproval,
	runConfirmation,
	runRequestedExecution,
} from "./confirmation";

describe(projectConfirmationCost.name, () => {
	it("projects a session group as one preflight plus every requested rep", () => {
		const projection = projectConfirmationCost({
			mode: "session",
			reps: 3,
			sessionBudgetUsd: 0.2,
		});

		expect(projection).toEqual({
			reps: 3,
			perRepMaximumUsd: 0.2,
			preflightMaximumUsd: 0.1,
			totalMaximumUsd: 0.7,
		});
	});

	it("prints a session group's projection as a budget the charge can exceed", () => {
		expect(
			formatProjectedCost(
				projectConfirmationCost({
					mode: "session",
					reps: 3,
					sessionBudgetUsd: 0.2,
				}),
			),
		).toBe(
			"Projected budget: $0.70 ($0.10 preflight + 3 reps x $0.20). A session stops only after the call that crosses its budget, so the charge can exceed this.",
		);
	});

	it("projects every session at its budget before a confirmation", () => {
		const replay = projectConfirmationCost({
			mode: "stage",
			reps: 5,
			sessionBudgetUsd: 5,
		});
		const pipeline = projectConfirmationCost({
			mode: "pipeline",
			reps: 5,
			stages: 4,
			sessionBudgetUsd: 5,
		});

		expect(replay).toEqual({
			reps: 5,
			perRepMaximumUsd: 20,
			totalMaximumUsd: 100,
		});
		expect(pipeline).toEqual({
			reps: 5,
			perRepMaximumUsd: 75,
			totalMaximumUsd: 375,
		});
		expect(formatProjectedCost(replay)).toBe(
			"Projected budget: $100.00 (5 reps x $20.00). A session stops only after the call that crosses its budget, so the charge can exceed this.",
		);
	});
});

describe(requireConfirmationApproval.name, () => {
	it("shows the projected budget before prompting for approval", async () => {
		const events: string[] = [];

		await requireConfirmationApproval(
			{
				reps: 5,
				perRepMaximumUsd: 20,
				totalMaximumUsd: 100,
			},
			false,
			{
				output: (message) => {
					events.push(`output: ${message}`);
				},
				prompt: (message) => {
					events.push(`prompt: ${message}`);
					return Promise.resolve("yes");
				},
			},
		);

		expect(events).toEqual([
			"output: Projected budget: $100.00 (5 reps x $20.00). A session stops only after the call that crosses its budget, so the charge can exceed this.",
			"prompt: Start confirmation? [y/N] ",
		]);
	});

	it("stops when interactive approval is declined", () => {
		expect(
			requireConfirmationApproval(
				{
					reps: 2,
					perRepMaximumUsd: 4,
					totalMaximumUsd: 8,
				},
				false,
				{
					output: () => undefined,
					prompt: () => Promise.resolve("no"),
				},
			),
		).rejects.toThrow("Confirmation declined");
	});

	it("uses noninteractive approval without prompting", async () => {
		let prompts = 0;

		await requireConfirmationApproval(
			{
				reps: 2,
				perRepMaximumUsd: 4,
				totalMaximumUsd: 8,
			},
			true,
			{
				output: () => undefined,
				prompt: () => {
					prompts += 1;
					return Promise.resolve("no");
				},
			},
		);

		expect(prompts).toBe(0);
	});
});

describe(runRequestedExecution.name, () => {
	it("labels and runs one debug rep when confirmation is absent", async () => {
		const output: string[] = [];
		let confirmations = 0;

		const result = await runRequestedExecution({
			confirmation: undefined,
			projectCost: () => {
				throw new Error("debug runs have no confirmation projection");
			},
			approval: {
				output: (message) => {
					output.push(message);
				},
				prompt: () => Promise.resolve("no"),
			},
			runDebug: () => Promise.resolve("debug result"),
			runConfirmed: () => {
				confirmations += 1;
				return Promise.resolve("confirmation result");
			},
		});

		expect(result).toBe("debug result");
		expect(output).toEqual(["single-rep evidence, not a score"]);
		expect(confirmations).toBe(0);
	});

	it("starts confirmation only after projected cost approval", async () => {
		const events: string[] = [];

		const result = await runRequestedExecution({
			confirmation: { reps: 3, approved: false },
			projectCost: () => ({
				reps: 3,
				perRepMaximumUsd: 20,
				totalMaximumUsd: 60,
			}),
			approval: {
				output: (message) => {
					events.push(`output:${message}`);
				},
				prompt: () => {
					events.push("prompt");
					return Promise.resolve("yes");
				},
			},
			runDebug: () => Promise.resolve("debug result"),
			runConfirmed: () => {
				events.push("start");
				return Promise.resolve("confirmation result");
			},
		});

		expect(result).toBe("confirmation result");
		expect(events).toEqual([
			"output:Projected budget: $60.00 (3 reps x $20.00). A session stops only after the call that crosses its budget, so the charge can exceed this.",
			"prompt",
			"start",
		]);
	});
});

describe(runConfirmation.name, () => {
	it("starts isolated reps together from one frozen input", async () => {
		const frozenInputs = Object.freeze({
			corpus: "frozen corpus",
			rubric: "frozen rubric",
			model: "sonnet",
			effort: "high",
			lineage: "checkpoint-1",
		});
		const started: ConfirmationRepPlan<typeof frozenInputs>[] = [];
		const releases: PromiseWithResolvers<string>[] = [];
		const execution = runConfirmation(
			{
				groupId: "confirmation-1",
				reps: 3,
				frozenInputs,
				worktreePath: (repId) => `/worktrees/${repId}`,
			},
			(plan) => {
				const release = Promise.withResolvers<string>();
				started.push(plan);
				releases.push(release);
				return release.promise;
			},
		);

		expect(started).toHaveLength(3);
		expect(started.map(({ repId }) => repId)).toEqual([
			"confirmation-1-rep-1",
			"confirmation-1-rep-2",
			"confirmation-1-rep-3",
		]);
		expect(new Set(started.map(({ worktreePath }) => worktreePath)).size).toBe(
			3,
		);
		expect(started.every(({ inputs }) => inputs === frozenInputs)).toBe(true);

		for (const [index, release] of releases.entries()) {
			release.resolve(`confirmation-1-rep-${index + 1}`);
		}

		expect(await execution).toEqual(
			started.map((plan) => ({
				plan,
				outcome: { status: "fulfilled", value: plan.repId },
			})),
		);
	});

	it("lets peer reps finish when one rejects", async () => {
		const completed: number[] = [];
		const results = await runConfirmation(
			{
				groupId: "confirmation-2",
				reps: 3,
				frozenInputs: "checkpoint-1",
				worktreePath: (repId) => `/worktrees/${repId}`,
			},
			async (plan) => {
				if (plan.ordinal === 2) {
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
		expect(completed).toEqual([1, 3]);
	});
});
