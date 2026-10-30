import { describe, expect, it } from "bun:test";

import {
	judgeSelfPreferenceWarning,
	parseArgs,
	parseReplayArgs,
} from "./config";
import {
	CASE_DEFAULTS,
	SESSION_ARGS,
	sessionValues,
} from "./configuration-test-support";

const resolvesIdenticalSourceCases = [
	{
		env: {
			BENCHMARK_EFFORT: "low",
			BENCHMARK_JUDGE_EFFORT: "medium",
			BENCHMARK_JUDGE_MODEL: "environment-judge",
			BENCHMARK_MODEL: "environment-model",
			BENCHMARK_SESSION_BUDGET_USD: "9",
		},
		expected: {
			effort: "high",
			judgeEffort: "xhigh",
			judgeModel: "haiku",
			model: "sonnet",
			sessionBudgetUsd: 5,
		},
		sessionArgs: [
			"--model",
			"sonnet",
			"--effort",
			"high",
			"--judge-model",
			"haiku",
			"--judge-effort",
			"xhigh",
			"--session-budget-usd",
			"5",
		],
		source: "explicit CLI values over the environment",
	},
	{
		env: {
			BENCHMARK_EFFORT: "high",
			BENCHMARK_JUDGE_EFFORT: "xhigh",
			BENCHMARK_JUDGE_MODEL: "haiku",
			BENCHMARK_MODEL: "sonnet",
			BENCHMARK_SESSION_BUDGET_USD: "5",
		},
		expected: {
			effort: "high",
			judgeEffort: "xhigh",
			judgeModel: "haiku",
			model: "sonnet",
			sessionBudgetUsd: 5,
		},
		sessionArgs: [],
		source: "environment values",
	},
] as const;

const rejectsIdenticalErrorsWhenConditionCases = [
	{
		condition: "the workflow model is missing",
		error: "Provide --model or BENCHMARK_MODEL",
		sessionArgs: ["--session-budget-usd", "5"],
	},
	{
		condition: "the workflow effort is missing",
		error: "Provide --effort or BENCHMARK_EFFORT",
		sessionArgs: ["--model", "sonnet", "--session-budget-usd", "5"],
	},
	{
		condition: "the session budget is missing",
		error: "Provide --session-budget-usd or BENCHMARK_SESSION_BUDGET_USD",
		sessionArgs: ["--model", "sonnet", "--effort", "medium"],
	},
	{
		condition: "the session budget is non-numeric",
		error: "Session budget must be a positive number",
		sessionArgs: [
			"--model",
			"sonnet",
			"--effort",
			"medium",
			"--session-budget-usd",
			"invalid",
		],
	},
	{
		condition: "the session budget is zero",
		error: "Session budget must be a positive number",
		sessionArgs: [
			"--model",
			"sonnet",
			"--effort",
			"medium",
			"--session-budget-usd",
			"0",
		],
	},
	{
		condition: "the session budget is negative",
		error: "Session budget must be a positive number",
		sessionArgs: [
			"--model",
			"sonnet",
			"--effort",
			"medium",
			"--session-budget-usd",
			"-1",
		],
	},
	{
		condition: "the minimum grade is not a grade letter",
		error: "Minimum grade must be one of A, B, C, D, F",
		sessionArgs: [...SESSION_ARGS, "--minimum-grade", "pass"],
	},
	{
		condition: "the workflow effort is unsupported",
		error:
			"Unsupported effort for workflow: extreme. Use low, medium, high, xhigh, or max",
		sessionArgs: [
			"--model",
			"sonnet",
			"--effort",
			"extreme",
			"--session-budget-usd",
			"5",
		],
	},
	{
		condition: "the Judge effort is unsupported",
		error:
			"Unsupported effort for Judge: extreme. Use low, medium, high, xhigh, or max",
		sessionArgs: [
			"--model",
			"sonnet",
			"--effort",
			"medium",
			"--judge-effort",
			"extreme",
			"--session-budget-usd",
			"5",
		],
	},
];
function warnsWhenUnrecognizedModelIdentifiersAreEqual(): void {
	expect(
		judgeSelfPreferenceWarning({
			judgeModel: "external-model",
			model: "external-model",
		}),
	).toContain("Self-preference warning");
}

function doesNotWarnWhenRecognizedModelFamiliesDiffer(): void {
	expect(
		judgeSelfPreferenceWarning({ judgeModel: "opus", model: "sonnet" }),
	).toBeUndefined();
}

function doesNotWarnWhenUnequalUnrecognizedIdentifiersShareAFamilyWord(): void {
	expect(
		judgeSelfPreferenceWarning({
			judgeModel: "other-opus-model",
			model: "vendor-opus-model",
		}),
	).toBeUndefined();
}

function describeWhenCLIOrEnvironmentSessionValuesAreAvailable(): void {
	it.each([...resolvesIdenticalSourceCases])(
		"resolves identical $source",
		({ sessionArgs, env, expected }) => {
			const runConfig = parseArgs(
				["--target", "./target", ...sessionArgs],
				env,
				CASE_DEFAULTS,
			);
			const replayConfig = parseReplayArgs(
				["--run", "run-1", "--stage", "build", ...sessionArgs],
				env,
			);

			expect(sessionValues(runConfig)).toEqual(expected);
			expect(sessionValues(replayConfig)).toEqual(expected);
		},
	);
}
function describeWhenSessionKnobsAreInvalid(): void {
	it.each(rejectsIdenticalErrorsWhenConditionCases)(
		"rejects identical errors when $condition",
		({ sessionArgs, error }) => {
			expect(() =>
				parseArgs(["--target", "./target", ...sessionArgs], {}, CASE_DEFAULTS),
			).toThrow(error);
			expect(() =>
				parseReplayArgs(
					["--run", "run-1", "--stage", "build", ...sessionArgs],
					{},
				),
			).toThrow(error);
		},
	);
}
function describeWhenUnrecognizedModelIdentifiersMatch(): void {
	it(
		"warns when unrecognized model identifiers are equal",
		warnsWhenUnrecognizedModelIdentifiersAreEqual,
	);
}
function describeWhenModelIdentifiersDiffer(): void {
	it(
		"does not warn when recognized model families differ",
		doesNotWarnWhenRecognizedModelFamiliesDiffer,
	);
	it(
		"does not warn when unequal unrecognized identifiers share a family word",
		doesNotWarnWhenUnequalUnrecognizedIdentifiersShareAFamilyWord,
	);
}
describe("run and replay session knobs", () => {
	describe(
		"when CLI or environment session values are available",
		describeWhenCLIOrEnvironmentSessionValuesAreAvailable,
	);
	describe(
		"when session knobs are invalid",
		describeWhenSessionKnobsAreInvalid,
	);
	describe(
		"when unrecognized model identifiers match",
		describeWhenUnrecognizedModelIdentifiersMatch,
	);
	describe("when model identifiers differ", describeWhenModelIdentifiersDiffer);
});
