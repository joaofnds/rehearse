import { describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CaseDefaults, Effort } from "./config";
import {
	CONTROL_DIR,
	DEFAULT_CASE_ID,
	displayPath,
	judgeSelfPreferenceWarning,
	parseArgs,
	parseCaseId,
	parseReplayArgs,
	parseReplayConfirmation,
	parseRunName,
	parseSessionArgs,
	parseStaleArgs,
	recordsDirectory,
} from "./config";

const CASE_DEFAULTS: CaseDefaults = {
	caseId: DEFAULT_CASE_ID,
	pipelinePath: "cases/audit-log/pipelines/default.json",
	targetPath: "/declared/target",
};

const CASE_DEFAULTS_WITH_SESSION_KNOBS: CaseDefaults = {
	...CASE_DEFAULTS,
	model: "declared-model",
	sessionBudgetUsd: 3,
};

interface SessionValues {
	readonly model: string;
	readonly effort: Effort | undefined;
	readonly judgeModel: string;
	readonly judgeEffort: Effort | undefined;
	readonly sessionBudgetUsd: number;
}

function sessionValues(
	config: ReturnType<typeof parseArgs> | ReturnType<typeof parseReplayArgs>,
): SessionValues {
	return {
		model: config.model,
		effort: config.effort,
		judgeModel: config.judgeModel,
		judgeEffort: config.judgeEffort,
		sessionBudgetUsd: config.sessionBudgetUsd,
	};
}

describe("run and replay session knobs", () => {
	it.each([
		{
			source: "explicit CLI values over the environment",
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
			env: {
				BENCHMARK_MODEL: "environment-model",
				BENCHMARK_EFFORT: "low",
				BENCHMARK_JUDGE_MODEL: "environment-judge",
				BENCHMARK_JUDGE_EFFORT: "medium",
				BENCHMARK_SESSION_BUDGET_USD: "9",
			},
			expected: {
				model: "sonnet",
				effort: "high",
				judgeModel: "haiku",
				judgeEffort: "xhigh",
				sessionBudgetUsd: 5,
			},
		},
		{
			source: "environment values",
			sessionArgs: [],
			env: {
				BENCHMARK_MODEL: "sonnet",
				BENCHMARK_EFFORT: "high",
				BENCHMARK_JUDGE_MODEL: "haiku",
				BENCHMARK_JUDGE_EFFORT: "xhigh",
				BENCHMARK_SESSION_BUDGET_USD: "5",
			},
			expected: {
				model: "sonnet",
				effort: "high",
				judgeModel: "haiku",
				judgeEffort: "xhigh",
				sessionBudgetUsd: 5,
			},
		},
	])("resolves identical $source", ({ sessionArgs, env, expected }) => {
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
	});

	it.each([
		{
			condition: "the workflow model is missing",
			sessionArgs: ["--session-budget-usd", "5"],
			error: "Provide --model or BENCHMARK_MODEL",
		},
		{
			condition: "the session budget is missing",
			sessionArgs: ["--model", "sonnet"],
			error: "Provide --session-budget-usd or BENCHMARK_SESSION_BUDGET_USD",
		},
		{
			condition: "the session budget is non-numeric",
			sessionArgs: ["--model", "sonnet", "--session-budget-usd", "invalid"],
			error: "Session budget must be a positive number",
		},
		{
			condition: "the session budget is zero",
			sessionArgs: ["--model", "sonnet", "--session-budget-usd", "0"],
			error: "Session budget must be a positive number",
		},
		{
			condition: "the session budget is negative",
			sessionArgs: ["--model", "sonnet", "--session-budget-usd", "-1"],
			error: "Session budget must be a positive number",
		},
		{
			condition: "the minimum grade is not a grade letter",
			sessionArgs: [
				"--model",
				"sonnet",
				"--session-budget-usd",
				"5",
				"--minimum-grade",
				"pass",
			],
			error: "Minimum grade must be one of A, B, C, D, F",
		},
		{
			condition: "the workflow effort is unsupported",
			sessionArgs: [
				"--model",
				"sonnet",
				"--effort",
				"extreme",
				"--session-budget-usd",
				"5",
			],
			error:
				"Unsupported effort for workflow: extreme. Use low, medium, high, xhigh, or max",
		},
		{
			condition: "the Judge effort is unsupported",
			sessionArgs: [
				"--model",
				"sonnet",
				"--judge-effort",
				"extreme",
				"--session-budget-usd",
				"5",
			],
			error:
				"Unsupported effort for Judge: extreme. Use low, medium, high, xhigh, or max",
		},
	])("rejects identical errors when $condition", ({ sessionArgs, error }) => {
		expect(() =>
			parseArgs(["--target", "./target", ...sessionArgs], {}, CASE_DEFAULTS),
		).toThrow(error);
		expect(() =>
			parseReplayArgs(
				["--run", "run-1", "--stage", "build", ...sessionArgs],
				{},
			),
		).toThrow(error);
	});
});

describe(parseArgs.name, () => {
	it.each([
		{ model: "sonnet", judgeModel: "opus" },
		{ model: "haiku", judgeModel: "opus" },
		{ model: "external-model", judgeModel: "opus" },
		{ model: "vendor-opus-model", judgeModel: "opus" },
		{ model: "opus", judgeModel: "sonnet" },
		{ model: "claude-opus-4-8", judgeModel: "sonnet" },
	])(
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

	it("resolves explicit configuration", () => {
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
			sourceDir: join(process.cwd(), "target"),
			model: "sonnet",
			effort: "high",
			judgeModel: "sonnet",
			judgeEffort: "high",
			sessionBudgetUsd: 5,
			minimumStageGrade: "B",
			pipelinePath: CASE_DEFAULTS.pipelinePath,
			pause: false,
		});
	});

	it("prioritizes the CLI Judge model over the environment", () => {
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
	});

	it("prioritizes the environment Judge model over the default", () => {
		const config = parseArgs(
			["--target", "./target", "--model", "opus", "--session-budget-usd", "5"],
			{ BENCHMARK_JUDGE_MODEL: "haiku" },
			CASE_DEFAULTS,
		);

		expect(config.judgeModel).toBe("haiku");
	});

	it("selects a pipeline definition file", () => {
		const config = parseArgs(
			[
				"--target",
				"./target",
				"--model",
				"sonnet",
				"--session-budget-usd",
				"5",
				"--pipeline",
				"pipelines/three-stage.json",
			],
			{},
			CASE_DEFAULTS,
		);

		expect(config.pipelinePath).toBe("pipelines/three-stage.json");
	});

	it("defaults the pipeline to the one the case declares", () => {
		const config = parseArgs(
			[
				"--target",
				"./target",
				"--model",
				"sonnet",
				"--session-budget-usd",
				"5",
			],
			{},
			CASE_DEFAULTS,
		);

		expect(config.pipelinePath).toBe(CASE_DEFAULTS.pipelinePath);
	});

	it("falls back to the target the case declares, and lets --target override it", () => {
		const sessionArgs = ["--model", "sonnet", "--session-budget-usd", "5"];

		const declared = parseArgs(sessionArgs, {}, CASE_DEFAULTS);
		const overridden = parseArgs(
			["--target", "./target", ...sessionArgs],
			{},
			CASE_DEFAULTS,
		);

		expect(declared.sourceDir).toBe(CASE_DEFAULTS.targetPath);
		expect(overridden.sourceDir).toBe(join(process.cwd(), "target"));
	});

	it("refuses an empty BENCHMARK_TARGET_DIR rather than resolving it to the control repository", () => {
		expect(() =>
			parseArgs(
				["--model", "sonnet", "--session-budget-usd", "5"],
				{ BENCHMARK_TARGET_DIR: "" },
				CASE_DEFAULTS,
			),
		).toThrow("Provide --target or BENCHMARK_TARGET_DIR");
	});

	it("prefers the environment target over the one the case declares", () => {
		const config = parseArgs(
			["--model", "sonnet", "--session-budget-usd", "5"],
			{ BENCHMARK_TARGET_DIR: "/environment/target" },
			CASE_DEFAULTS,
		);

		expect(config.sourceDir).toBe("/environment/target");
	});

	it("falls back to the model and budget the case declares", () => {
		const config = parseArgs(
			["--target", "./target"],
			{},
			CASE_DEFAULTS_WITH_SESSION_KNOBS,
		);

		expect(config.model).toBe("declared-model");
		expect(config.sessionBudgetUsd).toBe(3);
	});

	it("lets --model and --session-budget-usd override the case's declared values", () => {
		const config = parseArgs(
			[
				"--target",
				"./target",
				"--model",
				"sonnet",
				"--session-budget-usd",
				"5",
			],
			{},
			CASE_DEFAULTS_WITH_SESSION_KNOBS,
		);

		expect(config.model).toBe("sonnet");
		expect(config.sessionBudgetUsd).toBe(5);
	});

	it("records the case the run selected", () => {
		const config = parseArgs(
			["--model", "sonnet", "--session-budget-usd", "5"],
			{},
			CASE_DEFAULTS,
		);

		expect(config.caseId).toBe(DEFAULT_CASE_ID);
	});

	it("selects a five-rep confirmation explicitly", () => {
		const config = parseArgs(
			[
				"--target",
				"./target",
				"--model",
				"sonnet",
				"--session-budget-usd",
				"5",
				"--confirm",
			],
			{},
			CASE_DEFAULTS,
		);

		expect(config.confirmation).toEqual({ reps: 5, approved: false });
	});

	it.each([
		{ flags: ["--reps", "3"], error: "only with --confirm" },
		{ flags: ["--yes"], error: "only with --confirm" },
		{
			flags: ["--confirm", "--reps", "1"],
			error: "integer of at least 2",
		},
	])("rejects invalid confirmation flags: $flags", ({ flags, error }) => {
		expect(() =>
			parseArgs(
				[
					"--target",
					"./target",
					"--model",
					"sonnet",
					"--session-budget-usd",
					"5",
					...flags,
				],
				{},
				CASE_DEFAULTS,
			),
		).toThrow(error);
	});

	it("defaults Judge effort to workflow effort", () => {
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
	});

	it("resolves configuration from environment variables", () => {
		const config = parseArgs(
			[],
			{
				BENCHMARK_TARGET_DIR: "./target",
				BENCHMARK_MODEL: "sonnet",
				BENCHMARK_SESSION_BUDGET_USD: "5",
			},
			CASE_DEFAULTS,
		);

		expect(config.sourceDir).toBe(join(process.cwd(), "target"));
		expect(config.model).toBe("sonnet");
		expect(config.sessionBudgetUsd).toBe(5);
	});

	it("rejects unsupported effort levels", () => {
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
	});

	it("rejects missing spend limits", () => {
		expect(() =>
			parseArgs(
				["--target", "./target", "--model", "claude-opus-4-8"],
				{},
				CASE_DEFAULTS,
			),
		).toThrow("Provide --session-budget-usd");
	});
});

describe(parseReplayArgs.name, () => {
	it.each([
		{ model: "sonnet", judgeModel: "opus" },
		{ model: "haiku", judgeModel: "opus" },
		{ model: "external-model", judgeModel: "opus" },
		{ model: "vendor-opus-model", judgeModel: "opus" },
		{ model: "opus", judgeModel: "sonnet" },
		{ model: "claude-opus-4-8", judgeModel: "sonnet" },
	])(
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

	it("resolves the replay knobs", () => {
		const config = parseReplayArgs(
			[
				"--run",
				"2026-08-30T10-00-00.000Z",
				"--stage",
				"discuss",
				"--model",
				"sonnet",
				"--effort",
				"high",
				"--session-budget-usd",
				"5",
			],
			{},
		);

		expect(config).toEqual({
			runName: "2026-08-30T10-00-00.000Z",
			stage: "discuss",
			model: "sonnet",
			effort: "high",
			judgeModel: "opus",
			judgeEffort: "high",
			sessionBudgetUsd: 5,
			minimumStageGrade: "B",
		});
	});

	it("overrides confirmation reps and accepts noninteractive approval", () => {
		const config = parseReplayArgs(
			[
				"--run",
				"run-1",
				"--stage",
				"build",
				"--model",
				"sonnet",
				"--session-budget-usd",
				"5",
				"--confirm",
				"--reps",
				"7",
				"--yes",
			],
			{},
		);

		expect(config.confirmation).toEqual({ reps: 7, approved: true });
	});

	it("falls back to the benchmark environment variables", () => {
		const config = parseReplayArgs(["--run", "r", "--stage", "build"], {
			BENCHMARK_MODEL: "sonnet",
			BENCHMARK_JUDGE_MODEL: "haiku",
			BENCHMARK_SESSION_BUDGET_USD: "3",
		});

		expect(config.model).toBe("sonnet");
		expect(config.judgeModel).toBe("haiku");
		expect(config.sessionBudgetUsd).toBe(3);
	});

	it("prioritizes the CLI Judge model over the environment", () => {
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
	});

	it("requires the run and the stage", () => {
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
	});
});

describe(parseCaseId.name, () => {
	it("defaults to the audit-log case", () => {
		expect(parseCaseId(["--model", "sonnet"], {})).toBe(DEFAULT_CASE_ID);
	});

	it("reads the case from the environment when the flag is absent", () => {
		expect(parseCaseId([], { BENCHMARK_CASE: "other" })).toBe("other");
	});

	it("prefers the flag over the environment", () => {
		expect(
			parseCaseId(["--case", "flagged"], { BENCHMARK_CASE: "other" }),
		).toBe("flagged");
	});
});

describe(parseRunName.name, () => {
	it("reads the run named by --run", () => {
		expect(parseRunName(["--run", "run-1", "--stage", "build"])).toBe("run-1");
	});

	it("refuses when --run is absent", () => {
		expect(() => parseRunName(["--stage", "build"])).toThrow(
			"Provide --run with the run's name",
		);
	});
});

describe(parseReplayConfirmation.name, () => {
	it("reads a confirmation request without needing the model or budget", () => {
		expect(
			parseReplayConfirmation([
				"--run",
				"run-1",
				"--stage",
				"build",
				"--confirm",
			]),
		).toEqual({ reps: 5, approved: false });
	});

	it("reads no confirmation when --confirm is absent", () => {
		expect(
			parseReplayConfirmation(["--run", "run-1", "--stage", "build"]),
		).toBeUndefined();
	});
});

describe(judgeSelfPreferenceWarning.name, () => {
	it("warns when unrecognized model identifiers are equal", () => {
		expect(
			judgeSelfPreferenceWarning({
				model: "external-model",
				judgeModel: "external-model",
			}),
		).toContain("Self-preference warning");
	});

	it("does not warn when recognized model families differ", () => {
		expect(
			judgeSelfPreferenceWarning({ model: "sonnet", judgeModel: "opus" }),
		).toBeUndefined();
	});

	it("does not warn when unequal unrecognized identifiers share a family word", () => {
		expect(
			judgeSelfPreferenceWarning({
				model: "vendor-opus-model",
				judgeModel: "other-opus-model",
			}),
		).toBeUndefined();
	});
});

describe("the corpus source flag", () => {
	const knobs = ["--model", "haiku", "--session-budget-usd", "1"];

	it("carries --corpus onto a run configuration", () => {
		const config = parseArgs(
			[...knobs, "--corpus", "/variants/brief"],
			{},
			CASE_DEFAULTS,
		);

		expect(config.corpus).toBe("/variants/brief");
	});

	it("carries --corpus onto a session run configuration", () => {
		const config = parseSessionArgs(
			[...knobs, "--corpus", "/variants/brief"],
			{},
			{ caseId: "smoke" },
		);

		expect(config.corpus).toBe("/variants/brief");
	});

	it("carries --corpus onto a replay configuration", () => {
		const config = parseReplayArgs(
			[
				...knobs,
				"--run",
				"run-1",
				"--stage",
				"build",
				"--corpus",
				"/variants/brief",
			],
			{},
		);

		expect(config.corpus).toBe("/variants/brief");
	});

	it("leaves the corpus absent when --corpus is not given, which is the live install", () => {
		expect(parseArgs(knobs, {}, CASE_DEFAULTS).corpus).toBeUndefined();
		expect(
			parseSessionArgs(knobs, {}, { caseId: "smoke" }).corpus,
		).toBeUndefined();
	});
});

describe("session run knobs declared by the case", () => {
	it("falls back to the model and budget the session case declares", () => {
		const config = parseSessionArgs(
			[],
			{},
			{
				caseId: "smoke",
				model: "declared-model",
				sessionBudgetUsd: 0.2,
			},
		);

		expect(config.model).toBe("declared-model");
		expect(config.sessionBudgetUsd).toBe(0.2);
	});

	it("lets --model and --session-budget-usd override the session case's declared values", () => {
		const config = parseSessionArgs(
			["--model", "sonnet", "--session-budget-usd", "5"],
			{},
			{ caseId: "smoke", model: "declared-model", sessionBudgetUsd: 0.2 },
		);

		expect(config.model).toBe("sonnet");
		expect(config.sessionBudgetUsd).toBe(5);
	});
});

describe("replay knobs declared by the replayed run's case", () => {
	it("falls back to the model and budget the case declares", () => {
		const config = parseReplayArgs(
			["--run", "run-1", "--stage", "build"],
			{},
			{
				model: "declared-model",
				sessionBudgetUsd: 0.2,
			},
		);

		expect(config.model).toBe("declared-model");
		expect(config.sessionBudgetUsd).toBe(0.2);
	});

	it("lets --model and --session-budget-usd override the case's declared values", () => {
		const config = parseReplayArgs(
			[
				"--run",
				"run-1",
				"--stage",
				"build",
				"--model",
				"sonnet",
				"--session-budget-usd",
				"5",
			],
			{},
			{ model: "declared-model", sessionBudgetUsd: 0.2 },
		);

		expect(config.model).toBe("sonnet");
		expect(config.sessionBudgetUsd).toBe(5);
	});
});

describe(parseStaleArgs.name, () => {
	it("reads the model a replay would use from the environment", () => {
		const config = parseStaleArgs([], { BENCHMARK_MODEL: "opus" });

		expect(config.model).toBe("opus");
	});

	it("takes --model over the environment", () => {
		const config = parseStaleArgs(["--model", "haiku"], {
			BENCHMARK_MODEL: "opus",
		});

		expect(config.model).toBe("haiku");
	});

	it("reads the effort a replay would use", () => {
		const config = parseStaleArgs(["--effort", "high"], {});

		expect(config.effort).toBe("high");
	});

	it("asserts no model and no effort when neither is named", () => {
		const config = parseStaleArgs([], {});

		expect(config).toEqual({});
	});

	it("refuses an effort the workflow does not support", () => {
		expect(() => parseStaleArgs(["--effort", "turbo"], {})).toThrow(
			"Unsupported effort for workflow",
		);
	});
});

describe(displayPath.name, () => {
	it("names a path under the control root relative to it", () => {
		expect(displayPath(join(CONTROL_DIR, ".benchmark-runs/absent.json"))).toBe(
			".benchmark-runs/absent.json",
		);
	});

	it("discloses no home directory for a path under the control root", () => {
		expect(
			displayPath(join(CONTROL_DIR, "cases/smoke/case.json")),
		).not.toContain(homedir());
	});

	it("leaves a path outside the control root as it is", () => {
		expect(displayPath("/tmp/elsewhere/record.json")).toBe(
			"/tmp/elsewhere/record.json",
		);
	});
});

describe(recordsDirectory.name, () => {
	it("keeps records under the repository's .benchmark-runs when nothing overrides it", () => {
		expect(recordsDirectory({})).toBe(join(CONTROL_DIR, ".benchmark-runs"));
	});

	it("keeps records where REHEARSE_RECORDS_DIR names", () => {
		expect(
			recordsDirectory({ REHEARSE_RECORDS_DIR: "/elsewhere/records" }),
		).toBe("/elsewhere/records");
	});

	it("resolves a relative REHEARSE_RECORDS_DIR against the working directory", () => {
		expect(recordsDirectory({ REHEARSE_RECORDS_DIR: "./records" })).toBe(
			join(process.cwd(), "records"),
		);
	});

	it("refuses an empty REHEARSE_RECORDS_DIR rather than writing into the working directory", () => {
		expect(() => recordsDirectory({ REHEARSE_RECORDS_DIR: "" })).toThrow(
			"REHEARSE_RECORDS_DIR is empty",
		);
	});
});
