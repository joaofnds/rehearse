import { describe, expect, it } from "bun:test";

import { parseReplayArgs } from "./config";
import { SESSION_ARGS } from "./configuration-test-support";

const defaultsTheJudgeToJudgeModelWhenWorkflowModelIsModelCases = [
	{ judgeModel: "opus", model: "sonnet" },
	{ judgeModel: "opus", model: "haiku" },
	{ judgeModel: "opus", model: "external-model" },
	{ judgeModel: "opus", model: "vendor-opus-model" },
	{ judgeModel: "sonnet", model: "opus" },
	{ judgeModel: "sonnet", model: "claude-opus-4-8" },
];
function fallsBackToTheBenchmarkEnvironmentVariables(): void {
	const expectedSessionBudgetUsd = 3;

	const config = parseReplayArgs(["--run", "r", "--stage", "build"], {
		BENCHMARK_JUDGE_MODEL: "haiku",
		BENCHMARK_MODEL: "sonnet",
		BENCHMARK_SESSION_BUDGET_USD: "3",
	});

	expect(config.model).toBe("sonnet");
	expect(config.judgeModel).toBe("haiku");
	expect(config.sessionBudgetUsd).toBe(expectedSessionBudgetUsd);
}

function prioritizesTheCLIJudgeModelOverTheEnvironment(): void {
	const config = parseReplayArgs(
		[
			"--run",
			"run-1",
			"--stage",
			"build",
			"--model",
			"sonnet",
			"--judge-model",
			"haiku",
			"--session-budget-usd",
			"5",
		],
		{ BENCHMARK_JUDGE_MODEL: "opus" },
	);

	expect(config.judgeModel).toBe("haiku");
}

function requiresTheRunAndTheStage(): void {
	expect(() =>
		parseReplayArgs(
			["--stage", "build", "--model", "m", "--session-budget-usd", "5"],
			{},
		),
	).toThrow("Provide --run");
	expect(() =>
		parseReplayArgs(
			["--run", "r", "--model", "m", "--session-budget-usd", "5"],
			{},
		),
	).toThrow("Provide --stage");
}

function fallsBackToTheModelAndBudgetTheCaseDeclares(): void {
	const expectedSessionBudgetUsd = 0.2;

	const config = parseReplayArgs(
		["--run", "run-1", "--stage", "build"],
		{},
		{
			model: "declared-model",
			sessionBudgetUsd: 0.2,
		},
	);

	expect(config.model).toBe("declared-model");
	expect(config.sessionBudgetUsd).toBe(expectedSessionBudgetUsd);
}

function letsModelAndSessionBudgetUsdOverrideTheCaseSDeclaredValues(): void {
	const expectedSessionBudgetUsd = 5;

	const config = parseReplayArgs(
		["--run", "run-1", "--stage", "build", ...SESSION_ARGS],
		{},
		{ model: "declared-model", sessionBudgetUsd: 0.2 },
	);

	expect(config.model).toBe("sonnet");
	expect(config.sessionBudgetUsd).toBe(expectedSessionBudgetUsd);
}

describe(parseReplayArgs.name, () => {
	it.each(defaultsTheJudgeToJudgeModelWhenWorkflowModelIsModelCases)(
		"defaults the Judge to $judgeModel when workflow model is $model",
		({ model, judgeModel }) => {
			const config = parseReplayArgs(
				[
					"--run",
					"run-1",
					"--stage",
					"build",
					"--model",
					model,
					"--session-budget-usd",
					"5",
				],
				{},
			);

			expect(config.judgeModel).toBe(judgeModel);
		},
	);
	it(
		"falls back to the benchmark environment variables",
		fallsBackToTheBenchmarkEnvironmentVariables,
	);
	it(
		"prioritizes the CLI Judge model over the environment",
		prioritizesTheCLIJudgeModelOverTheEnvironment,
	);
	it("requires the run and the stage", requiresTheRunAndTheStage);
	it(
		"falls back to the model and budget the case declares",
		fallsBackToTheModelAndBudgetTheCaseDeclares,
	);
	it(
		"lets --model and --session-budget-usd override the case's declared values",
		letsModelAndSessionBudgetUsdOverrideTheCaseSDeclaredValues,
	);
});
