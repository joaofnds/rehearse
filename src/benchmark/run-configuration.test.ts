import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { DEFAULT_CASE_ID, parseArgs } from "./config";
import {
	CASE_DEFAULTS,
	CASE_DEFAULTS_WITH_SESSION_KNOBS,
	SESSION_ARGS,
} from "./configuration-test-support";

const defaultsTheJudgeToJudgeModelWhenWorkflowModelIsModelCases = [
	{ judgeModel: "opus", model: "sonnet" },
	{ judgeModel: "opus", model: "haiku" },
	{ judgeModel: "opus", model: "external-model" },
	{ judgeModel: "opus", model: "vendor-opus-model" },
	{ judgeModel: "sonnet", model: "opus" },
	{ judgeModel: "sonnet", model: "claude-opus-4-8" },
];

function resolvesExplicitConfiguration(): void {
	const config = parseArgs(
		[
			"--target",
			"./target",
			"--model",
			"sonnet",
			"--effort",
			"high",
			"--judge-model",
			"sonnet",
			"--judge-effort",
			"high",
			"--session-budget-usd",
			"5",
		],
		{},
		CASE_DEFAULTS,
	);

	expect(config).toEqual({
		caseId: DEFAULT_CASE_ID,
		effort: "high",
		judgeEffort: "high",
		judgeModel: "sonnet",
		minimumStageGrade: "B",
		model: "sonnet",
		pause: false,
		pipelinePath: CASE_DEFAULTS.pipelinePath,
		sessionBudgetUsd: 5,
		sourceDir: join(process.cwd(), "target"),
	});
}

function prioritizesTheCLIJudgeModelOverTheEnvironment(): void {
	const config = parseArgs(
		[
			"--target",
			"./target",
			"--model",
			"sonnet",
			"--judge-model",
			"haiku",
			"--session-budget-usd",
			"5",
		],
		{ BENCHMARK_JUDGE_MODEL: "opus" },
		CASE_DEFAULTS,
	);

	expect(config.judgeModel).toBe("haiku");
}

function prioritizesTheEnvironmentJudgeModelOverTheDefault(): void {
	const config = parseArgs(
		["--target", "./target", "--model", "opus", "--session-budget-usd", "5"],
		{ BENCHMARK_JUDGE_MODEL: "haiku" },
		CASE_DEFAULTS,
	);

	expect(config.judgeModel).toBe("haiku");
}

function refusesAnEmptyBENCHMARKTARGETDIRRatherThanResolvingItToTheControlRepository(): void {
	expect(() =>
		parseArgs([...SESSION_ARGS], { BENCHMARK_TARGET_DIR: "" }, CASE_DEFAULTS),
	).toThrow("Provide --target or BENCHMARK_TARGET_DIR");
}

function fallsBackToTheModelAndBudgetTheCaseDeclares(): void {
	const expectedSessionBudgetUsd = 3;

	const config = parseArgs(
		["--target", "./target"],
		{},
		CASE_DEFAULTS_WITH_SESSION_KNOBS,
	);

	expect(config.model).toBe("declared-model");
	expect(config.sessionBudgetUsd).toBe(expectedSessionBudgetUsd);
}

function letsModelAndSessionBudgetUsdOverrideTheCaseSDeclaredValues(): void {
	const expectedSessionBudgetUsd = 5;

	const config = parseArgs(
		["--target", "./target", ...SESSION_ARGS],
		{},
		CASE_DEFAULTS_WITH_SESSION_KNOBS,
	);

	expect(config.model).toBe("sonnet");
	expect(config.sessionBudgetUsd).toBe(expectedSessionBudgetUsd);
}

function recordsTheCaseTheRunSelected(): void {
	const config = parseArgs([...SESSION_ARGS], {}, CASE_DEFAULTS);

	expect(config.caseId).toBe(DEFAULT_CASE_ID);
}

function defaultsJudgeEffortToWorkflowEffort(): void {
	const config = parseArgs(
		[
			"--target",
			"./target",
			"--model",
			"sonnet",
			"--effort",
			"xhigh",
			"--session-budget-usd",
			"5",
		],
		{},
		CASE_DEFAULTS,
	);

	expect(config.judgeEffort).toBe("xhigh");
}

function resolvesConfigurationFromEnvironmentVariables(): void {
	const expectedSessionBudgetUsd = 5;

	const config = parseArgs(
		[],
		{
			BENCHMARK_MODEL: "sonnet",
			BENCHMARK_SESSION_BUDGET_USD: "5",
			BENCHMARK_TARGET_DIR: "./target",
		},
		CASE_DEFAULTS,
	);

	expect(config.sourceDir).toBe(join(process.cwd(), "target"));
	expect(config.model).toBe("sonnet");
	expect(config.sessionBudgetUsd).toBe(expectedSessionBudgetUsd);
}

function rejectsUnsupportedEffortLevels(): void {
	expect(() =>
		parseArgs(
			[
				"--target",
				"./target",
				"--model",
				"sonnet",
				"--effort",
				"extreme",
				"--session-budget-usd",
				"5",
			],
			{},
			CASE_DEFAULTS,
		),
	).toThrow("Unsupported effort");
}

function rejectsMissingSpendLimits(): void {
	expect(() =>
		parseArgs(
			["--target", "./target", "--model", "claude-opus-4-8"],
			{},
			CASE_DEFAULTS,
		),
	).toThrow("Provide --session-budget-usd");
}

describe("pipeline run Judge selection", () => {
	it.each(defaultsTheJudgeToJudgeModelWhenWorkflowModelIsModelCases)(
		"defaults the Judge to $judgeModel when workflow model is $model",
		({ model, judgeModel }) => {
			const config = parseArgs(
				["--target", "./target", "--model", model, "--session-budget-usd", "5"],
				{},
				CASE_DEFAULTS,
			);

			expect(config.judgeModel).toBe(judgeModel);
		},
	);
	it(
		"prioritizes the CLI Judge model over the environment",
		prioritizesTheCLIJudgeModelOverTheEnvironment,
	);
	it(
		"prioritizes the environment Judge model over the default",
		prioritizesTheEnvironmentJudgeModelOverTheDefault,
	);
	it(
		"defaults Judge effort to workflow effort",
		defaultsJudgeEffortToWorkflowEffort,
	);
});

function describeWhenTargetAndSessionSettingsAreUsable(): void {
	it("resolves explicit configuration", resolvesExplicitConfiguration);
	it(
		"falls back to the model and budget the case declares",
		fallsBackToTheModelAndBudgetTheCaseDeclares,
	);
	it(
		"lets --model and --session-budget-usd override the case's declared values",
		letsModelAndSessionBudgetUsdOverrideTheCaseSDeclaredValues,
	);
	it("records the case the run selected", recordsTheCaseTheRunSelected);
	it(
		"resolves configuration from environment variables",
		resolvesConfigurationFromEnvironmentVariables,
	);
}

function describeWhenTargetOrSessionSettingsAreUnusable(): void {
	it(
		"refuses an empty BENCHMARK_TARGET_DIR rather than resolving it to the control repository",
		refusesAnEmptyBENCHMARKTARGETDIRRatherThanResolvingItToTheControlRepository,
	);
	it("rejects unsupported effort levels", rejectsUnsupportedEffortLevels);
	it("rejects missing spend limits", rejectsMissingSpendLimits);
}

describe("pipeline run settings", () => {
	describe(
		"when target and session settings are usable",
		describeWhenTargetAndSessionSettingsAreUsable,
	);
	describe(
		"when target or session settings are unusable",
		describeWhenTargetOrSessionSettingsAreUnusable,
	);
});
