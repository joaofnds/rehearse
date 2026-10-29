import { describe, expect, it } from "bun:test";

import {
	formatProjectedCost,
	projectConfirmationCost,
	requireConfirmationApproval,
} from "./confirmation";

const PROMPT_COUNT_INCREMENT = 1;

const SPEND_CEILING_ABOVE_EVERY_SESSION_BUDGET_USD = 100;

const projectConfirmationCostProjectsASessionGroupAsOnePreflightPlusEveryRequestedRep =
	(): void => {
		const projection = projectConfirmationCost({
			mode: "session",
			reps: 3,
			sessionBudgetUsd: 0.2,
			spendCeilingUsd: SPEND_CEILING_ABOVE_EVERY_SESSION_BUDGET_USD,
		});

		expect(projection).toEqual({
			perRepMaximumUsd: 0.2,
			preflightMaximumUsd: 0.1,
			reps: 3,
			totalMaximumUsd: 0.7,
		});
	};

const projectConfirmationCostPrintsASessionGroupsProjectionAsABudgetTheChargeCanExceed =
	(): void => {
		expect(
			formatProjectedCost(
				projectConfirmationCost({
					mode: "session",
					reps: 3,
					sessionBudgetUsd: 0.2,
					spendCeilingUsd: SPEND_CEILING_ABOVE_EVERY_SESSION_BUDGET_USD,
				}),
				SPEND_CEILING_ABOVE_EVERY_SESSION_BUDGET_USD,
			),
		).toBe(
			"Projected budget: $0.70 ($0.10 preflight + 3 reps x $0.20). Ceiling $100.00 per attempt, $300.00 for the group of 3. A session stops only after the call that crosses its budget, so the charge can exceed this.",
		);
	};

const projectConfirmationCostProjectsEverySessionAtItsBudgetBeforeAConfirmation =
	(): void => {
		const replay = projectConfirmationCost({
			mode: "stage",
			reps: 5,
			sessionBudgetUsd: 5,
			spendCeilingUsd: SPEND_CEILING_ABOVE_EVERY_SESSION_BUDGET_USD,
		});
		const pipeline = projectConfirmationCost({
			mode: "pipeline",
			reps: 5,
			sessionBudgetUsd: 5,
			spendCeilingUsd: SPEND_CEILING_ABOVE_EVERY_SESSION_BUDGET_USD,
			stages: 4,
		});

		expect(replay).toEqual({
			perRepMaximumUsd: 20,
			reps: 5,
			totalMaximumUsd: 100,
		});
		expect(pipeline).toEqual({
			perRepMaximumUsd: 75,
			reps: 5,
			totalMaximumUsd: 375,
		});
		expect(
			formatProjectedCost(replay, SPEND_CEILING_ABOVE_EVERY_SESSION_BUDGET_USD),
		).toBe(
			"Projected budget: $100.00 (5 reps x $20.00). Ceiling $100.00 per attempt, $500.00 for the group of 5. A session stops only after the call that crosses its budget, so the charge can exceed this.",
		);
	};

const projectConfirmationCostHoldsEachRepToTheStoredSpendCeilingBelowItsSessionBudgets =
	(): void => {
		const request = {
			mode: "stage",
			reps: 2,
			sessionBudgetUsd: 10,
			spendCeilingUsd: 6,
		} as const;

		const projection = projectConfirmationCost(request);

		expect(projection).toEqual({
			perRepMaximumUsd: 6,
			reps: 2,
			totalMaximumUsd: 12,
		});
		expect(formatProjectedCost(projection, request.spendCeilingUsd)).toBe(
			"Projected budget: $12.00 (2 reps x $6.00). Ceiling $6.00 per attempt, $12.00 for the group of 2. A session stops only after the call that crosses its budget, so the charge can exceed this.",
		);
	};

const projectConfirmationCostNamesTheStoredSpendCeilingAboveTheSessionBudgetsTheProjectionHolds =
	(): void => {
		const request = {
			mode: "stage",
			reps: 2,
			sessionBudgetUsd: 10,
			spendCeilingUsd: 50,
		} as const;

		const line = formatProjectedCost(
			projectConfirmationCost(request),
			request.spendCeilingUsd,
		);

		expect(line).toBe(
			"Projected budget: $80.00 (2 reps x $40.00). Ceiling $50.00 per attempt, $100.00 for the group of 2. A session stops only after the call that crosses its budget, so the charge can exceed this.",
		);
	};

const requireConfirmationApprovalShowsTheProjectedBudgetBeforePromptingForApproval =
	async (): Promise<void> => {
		const events: string[] = [];

		await requireConfirmationApproval(
			{
				approved: false,
				projection: {
					perRepMaximumUsd: 20,
					reps: 5,
					totalMaximumUsd: 100,
				},
				spendCeilingUsd: SPEND_CEILING_ABOVE_EVERY_SESSION_BUDGET_USD,
			},
			{
				output: (message) => {
					events.push(`output: ${message}`);
				},
				prompt: async (message) => {
					events.push(`prompt: ${message}`);
					return await Promise.resolve("yes");
				},
			},
		);

		expect(events).toEqual([
			"output: Projected budget: $100.00 (5 reps x $20.00). Ceiling $100.00 per attempt, $500.00 for the group of 5. A session stops only after the call that crosses its budget, so the charge can exceed this.",
			"prompt: Start confirmation? [y/N] ",
		]);
	};

const requireConfirmationApprovalStopsWhenInteractiveApprovalIsDeclined =
	(): void => {
		expect(
			requireConfirmationApproval(
				{
					approved: false,
					projection: {
						perRepMaximumUsd: 4,
						reps: 2,
						totalMaximumUsd: 8,
					},
					spendCeilingUsd: SPEND_CEILING_ABOVE_EVERY_SESSION_BUDGET_USD,
				},
				{
					output: (message) => {
						expect(message).toBe(
							"Projected budget: $8.00 (2 reps x $4.00). Ceiling $100.00 per attempt, $200.00 for the group of 2. A session stops only after the call that crosses its budget, so the charge can exceed this.",
						);
					},
					prompt: async () => await Promise.resolve("no"),
				},
			),
		).rejects.toThrow("Confirmation declined");
	};

const requireConfirmationApprovalUsesNoninteractiveApprovalWithoutPrompting =
	async (): Promise<void> => {
		const expectedPrompts = 0;

		let prompts = 0;

		await requireConfirmationApproval(
			{
				approved: true,
				projection: {
					perRepMaximumUsd: 4,
					reps: 2,
					totalMaximumUsd: 8,
				},
				spendCeilingUsd: SPEND_CEILING_ABOVE_EVERY_SESSION_BUDGET_USD,
			},
			{
				output: (message) => {
					expect(message).toBe(
						"Projected budget: $8.00 (2 reps x $4.00). Ceiling $100.00 per attempt, $200.00 for the group of 2. A session stops only after the call that crosses its budget, so the charge can exceed this.",
					);
				},
				prompt: async () => {
					prompts += PROMPT_COUNT_INCREMENT;
					return await Promise.resolve("no");
				},
			},
		);

		expect(prompts).toBe(expectedPrompts);
	};

describe(projectConfirmationCost.name, () => {
	it(
		"projects a session group as one preflight plus every requested rep",
		projectConfirmationCostProjectsASessionGroupAsOnePreflightPlusEveryRequestedRep,
	);

	it(
		"prints a session group's projection as a budget the charge can exceed",
		projectConfirmationCostPrintsASessionGroupsProjectionAsABudgetTheChargeCanExceed,
	);

	it(
		"projects every session at its budget before a confirmation",
		projectConfirmationCostProjectsEverySessionAtItsBudgetBeforeAConfirmation,
	);

	it(
		"holds each rep to the stored spend ceiling below its session budgets",
		projectConfirmationCostHoldsEachRepToTheStoredSpendCeilingBelowItsSessionBudgets,
	);

	it(
		"names the stored spend ceiling above the session budgets the projection holds",
		projectConfirmationCostNamesTheStoredSpendCeilingAboveTheSessionBudgetsTheProjectionHolds,
	);
});

describe(requireConfirmationApproval.name, () => {
	it(
		"shows the projected budget before prompting for approval",
		requireConfirmationApprovalShowsTheProjectedBudgetBeforePromptingForApproval,
	);

	it(
		"stops when interactive approval is declined",
		requireConfirmationApprovalStopsWhenInteractiveApprovalIsDeclined,
	);

	it(
		"uses noninteractive approval without prompting",
		requireConfirmationApprovalUsesNoninteractiveApprovalWithoutPrompting,
	);
});
