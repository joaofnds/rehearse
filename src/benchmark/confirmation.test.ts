import { describe, expect, it } from "bun:test";

import {
	formatProjectedCost,
	projectConfirmationCost,
	requireConfirmationApproval,
} from "./confirmation";

const PROMPT_COUNT_INCREMENT = 1;

const projectConfirmationCostProjectsASessionGroupAsOnePreflightPlusEveryRequestedRep =
	(): void => {
		const projection = projectConfirmationCost({
			mode: "session",
			reps: 3,
			sessionBudgetUsd: 0.2,
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
				}),
			),
		).toBe(
			"Projected budget: $0.70 ($0.10 preflight + 3 reps x $0.20). A session stops only after the call that crosses its budget, so the charge can exceed this.",
		);
	};

const projectConfirmationCostProjectsEverySessionAtItsBudgetBeforeAConfirmation =
	(): void => {
		const replay = projectConfirmationCost({
			mode: "stage",
			reps: 5,
			sessionBudgetUsd: 5,
		});
		const pipeline = projectConfirmationCost({
			mode: "pipeline",
			reps: 5,
			sessionBudgetUsd: 5,
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
		expect(formatProjectedCost(replay)).toBe(
			"Projected budget: $100.00 (5 reps x $20.00). A session stops only after the call that crosses its budget, so the charge can exceed this.",
		);
	};

const requireConfirmationApprovalShowsTheProjectedBudgetBeforePromptingForApproval =
	async (): Promise<void> => {
		const events: string[] = [];

		await requireConfirmationApproval(
			{
				perRepMaximumUsd: 20,
				reps: 5,
				totalMaximumUsd: 100,
			},
			false,
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
			"output: Projected budget: $100.00 (5 reps x $20.00). A session stops only after the call that crosses its budget, so the charge can exceed this.",
			"prompt: Start confirmation? [y/N] ",
		]);
	};

const requireConfirmationApprovalStopsWhenInteractiveApprovalIsDeclined =
	(): void => {
		expect(
			requireConfirmationApproval(
				{
					perRepMaximumUsd: 4,
					reps: 2,
					totalMaximumUsd: 8,
				},
				false,
				{
					output: (message) => {
						expect(message).toBe(
							"Projected budget: $8.00 (2 reps x $4.00). A session stops only after the call that crosses its budget, so the charge can exceed this.",
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
				perRepMaximumUsd: 4,
				reps: 2,
				totalMaximumUsd: 8,
			},
			true,
			{
				output: (message) => {
					expect(message).toBe(
						"Projected budget: $8.00 (2 reps x $4.00). A session stops only after the call that crosses its budget, so the charge can exceed this.",
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
