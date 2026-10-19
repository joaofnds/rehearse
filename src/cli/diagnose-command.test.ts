import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import type { AnalysisInvoker } from "#benchmark/root-cause-analysis";
import {
	ANSWER,
	FakeAnalysisProvider,
	answering,
} from "#benchmark/root-cause-analysis-provider-test-fixtures";
import {
	RUN,
	runStoppedAtBuild,
} from "#benchmark/root-cause-analysis-test-support";
import { nothingRunning } from "#benchmark/run-records-test-support";
import type { OutputRecorder } from "#cli/cli-test-support";
import {
	CliTestWorkspace,
	failureOf,
	recordOutput,
} from "#cli/cli-test-support";
import { UsageError } from "#cli/commands";
import type { DiagnoseDependencies } from "#cli/diagnose-command";
import runDiagnose from "#cli/diagnose-command";

import DiagnoseRequestBuilder from "./diagnose-request-test-builder";

const workspace = CliTestWorkspace.forEachTest();

const STORED_SPEND_CEILING_USD = 30;

const EXPONENT_FORMAT_BUDGET_USD = 5e-7;
const GIVEN_BUDGET_USD = 2.5;

async function endedRun(): Promise<string> {
	const root = await workspace.createDirectory("rehearse-diagnose-");
	await runStoppedAtBuild(root);

	return root;
}

function answeringWith(
	structuredOutput: ReturnType<typeof answering>["structured_output"],
): AnalysisInvoker {
	return async () =>
		await Promise.resolve(JSON.stringify(answering(structuredOutput)));
}

class InvokerRequests {
	public readonly models: string[] = [];
}

function dependencies(
	recorder: OutputRecorder,
	invoke: AnalysisInvoker,
	requests = new InvokerRequests(),
): DiagnoseDependencies {
	const { models } = requests;

	return {
		invokerFor: (model) => {
			models.push(model);

			return invoke;
		},
		liveness: nothingRunning,
		now: () => new Date("2026-10-04T12:00:00.000Z"),
		output: recorder.output,
		requireSpendCeiling: async () =>
			await Promise.resolve(STORED_SPEND_CEILING_USD),
	};
}

async function printsTheRecordItWroteAfterStatingWhatThe(): Promise<void> {
	const directory = await endedRun();
	const recorder = recordOutput();
	const requests = new InvokerRequests();

	await runDiagnose(
		new DiagnoseRequestBuilder({ runsDirectory: directory }).build(),
		dependencies(recorder, answeringWith(ANSWER), requests),
	);

	expect(requests.models).toEqual(["sonnet"]);
	expect(recorder.stderr).toEqual([
		`Analyzing run ${RUN} with sonnet; the call spends at most $1.\n`,
	]);
	expect(recorder.stdout).toEqual([
		`${join(directory, "analyses", RUN, "2026-10-04T12-00-00.000Z.json")}\n`,
	]);
}

async function capsTheCallAtTheBudgetItIsGiven(): Promise<void> {
	const directory = await endedRun();
	const recorder = recordOutput();
	const provider = new FakeAnalysisProvider();

	await runDiagnose(
		new DiagnoseRequestBuilder({
			budgetUsd: "2.5",
			id: `run:${RUN}`,
			runsDirectory: directory,
		}).build(),
		dependencies(recorder, provider.invoke),
	);

	expect(recorder.stderr).toEqual([
		`Analyzing run ${RUN} with sonnet; the call spends at most $2.5.\n`,
	]);
	expect(provider.budgets).toEqual([GIVEN_BUDGET_USD]);
}

async function readsABudgetInTheExponentFormATiny(): Promise<void> {
	const directory = await endedRun();
	const recorder = recordOutput();
	const provider = new FakeAnalysisProvider();

	await runDiagnose(
		new DiagnoseRequestBuilder({
			budgetUsd: String(EXPONENT_FORMAT_BUDGET_USD),
			id: `run:${RUN}`,
			runsDirectory: directory,
		}).build(),
		dependencies(recorder, provider.invoke),
	);

	expect(recorder.stderr).toEqual([
		`Analyzing run ${RUN} with sonnet; the call spends at most $5e-7.\n`,
	]);
	expect(provider.budgets).toEqual([EXPONENT_FORMAT_BUDGET_USD]);
}

async function printsTheFailedRecordAndFails(): Promise<void> {
	const expectedStdoutCount = 1;

	const directory = await endedRun();
	const recorder = recordOutput();

	const analysisRequest = new DiagnoseRequestBuilder({
		runsDirectory: directory,
	}).build();
	const analysisDependencies = dependencies(
		recorder,
		answeringWith({ ...ANSWER, stages: [] }),
	);
	const error = await failureOf(
		runDiagnose(analysisRequest, analysisDependencies),
	);

	expect(recorder.stdout).toHaveLength(expectedStdoutCount);
	expect(error).not.toBeInstanceOf(UsageError);
	expect(error.message).toStartWith(
		"The root-cause analysis failed: The answer reads stages",
	);
}

describe(runDiagnose.name, () => {
	it(
		"prints the record it wrote, after stating what the call could spend",
		printsTheRecordItWroteAfterStatingWhatThe,
	);
	it(
		"caps the call at the budget it is given",
		capsTheCallAtTheBudgetItIsGiven,
	);
	it(
		"reads a budget in the exponent form a tiny number prints in",
		readsABudgetInTheExponentFormATiny,
	);
	describe("when the session's answer is refused", () => {
		it("prints the failed record and fails", printsTheFailedRecordAndFails);
	});
});

const refusesSWithoutACallExamples = [
	["no run", { id: undefined }, "Provide the run: rehearse diagnose <run>"],
	["no model", { model: undefined }, "Provide the model: --model <model>"],
	[
		"a zero budget",
		{ budgetUsd: "0" },
		'The budget is a positive number of USD, not "0"',
	],
	[
		"a hexadecimal budget",
		{ budgetUsd: "0x10" },
		'The budget is a positive number of USD, not "0x10"',
	],
] as const;

describe(runDiagnose.name, () => {
	describe("when the command line is incomplete", () => {
		it.each(refusesSWithoutACallExamples)(
			"refuses %s without a call",
			async (_case, overrides, message) => {
				const directory = await endedRun();
				const requests = new InvokerRequests();

				const analysisRequest = new DiagnoseRequestBuilder({
					runsDirectory: directory,
					...overrides,
				}).build();
				const analysisDependencies = dependencies(
					recordOutput(),
					answeringWith(ANSWER),
					requests,
				);
				const error = await failureOf(
					runDiagnose(analysisRequest, analysisDependencies),
				);

				expect(error).toBeInstanceOf(UsageError);
				expect(error.message).toBe(message);
				expect(requests.models).toEqual([]);
			},
		);
	});
});
