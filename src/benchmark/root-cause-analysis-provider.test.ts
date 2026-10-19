import { describe, expect, it } from "bun:test";

import { ClaudeSessionError, parseClaudeEnvelope } from "./claude";
import {
	analysisSessionArgs,
	analyzeRun,
	readRootCauseAnalyses,
} from "./root-cause-analysis";
import { FakeAnalysisProvider } from "./root-cause-analysis-provider-test-fixtures";
import {
	ANALYSIS_BUDGET_USD,
	OPTION_AND_VALUE_COUNT,
	REDUCED_STORED_SPEND_CEILING_USD,
	dependencies,
	registerAnalysisFixtureCleanup,
	runsDirectory,
} from "./root-cause-analysis-test-environment";
import { RUN, runStoppedAtBuild } from "./root-cause-analysis-test-support";
import { budgetHaltEnvelope } from "./test-support";

registerAnalysisFixtureCleanup();

const ANALYSIS_EXAMPLES_11 = (
	[
		{
			budgetUsd: 1,
			capUsd: 1,
			ceilingUsd: 30,
			name: "spends at most the cap when the ceiling is higher",
		},
		{
			budgetUsd: 2,
			capUsd: 5,
			ceilingUsd: 2,
			name: "spends at most the ceiling when the cap is higher",
		},
	] as const
).map(
	({ name, capUsd, ceilingUsd, budgetUsd }) =>
		[name, capUsd, ceilingUsd, budgetUsd] as const,
);
async function recordsTheFailureWithWhatTheSessionSpent(): Promise<void> {
	const directory = await runsDirectory();
	await runStoppedAtBuild(directory);
	const halt = new ClaudeSessionError(
		parseClaudeEnvelope(await budgetHaltEnvelope()),
	);
	const provider = new FakeAnalysisProvider();
	provider.fail(halt);

	const { record } = await analyzeRun(
		{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
		dependencies(provider.invoke),
	);

	expect(record).toMatchObject({
		costUsd: halt.costUsd,
		outcome: "failed",
		reason: halt.message,
	});
}

async function stillWritesARecordItsReaderAccepts(): Promise<void> {
	const directory = await runsDirectory();
	await runStoppedAtBuild(directory);
	const provider = new FakeAnalysisProvider();
	// A provider client can reject with an error that carries no message.
	provider.failWithoutMessage();
	const clockSteppedBack = [
		new Date("2026-10-04T12:00:05.000Z"),
		new Date("2026-10-04T12:00:00.000Z"),
	];

	await analyzeRun(
		{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
		{
			...dependencies(provider.invoke),
			now: () => clockSteppedBack.shift() ?? new Date(),
		},
	);

	const { records, unreadable } = await readRootCauseAnalyses({
		run: RUN,
		runsDirectory: directory,
	});

	expect(unreadable).toEqual([]);
	expect(records).toMatchObject([
		{
			durationMs: 0,
			outcome: "failed",
			reason: "The analysis call failed with no message",
		},
	]);
}

async function statesTheMostItCanSpendBeforeTheCall(): Promise<void> {
	const directory = await runsDirectory();
	await runStoppedAtBuild(directory);
	const events: string[] = [];
	const provider = new FakeAnalysisProvider();

	await analyzeRun(
		{ capUsd: 5, model: "sonnet", run: RUN, runsDirectory: directory },
		{
			...dependencies(async (prompt, budgetUsd) => {
				events.push("call");

				return await provider.invoke(prompt, budgetUsd);
			}),
			progress: (message) => {
				events.push(message);
			},
			requireSpendCeiling: async () =>
				await Promise.resolve(REDUCED_STORED_SPEND_CEILING_USD),
		},
	);

	expect(events).toEqual([
		`Analyzing run ${RUN} with sonnet; the call spends at most $2.`,
		"call",
	]);
}

function runsTheSessionSealedUnderTheModelAndTheBudgetItIsGiven(): void {
	const args = analysisSessionArgs("sonnet", ANALYSIS_BUDGET_USD);

	expect(args).toContain("--safe-mode");
	expect(
		args.slice(
			args.indexOf("--tools"),
			args.indexOf("--tools") + OPTION_AND_VALUE_COUNT,
		),
	).toEqual(["--tools", ""]);
	expect(
		args.slice(
			args.indexOf("--model"),
			args.indexOf("--model") + OPTION_AND_VALUE_COUNT,
		),
	).toEqual(["--model", "sonnet"]);
	expect(
		args.slice(
			args.indexOf("--max-budget-usd"),
			args.indexOf("--max-budget-usd") + OPTION_AND_VALUE_COUNT,
		),
	).toEqual(["--max-budget-usd", "1"]);
	expect(args).not.toContain("--dangerously-skip-permissions");
}
describe(analyzeRun.name, () => {
	describe("when the provider halts the session", () => {
		it(
			"records the failure with what the session spent",
			recordsTheFailureWithWhatTheSessionSpent,
		);
	});
	describe("when the call fails in a way the record schema would refuse", () => {
		it(
			"still writes a record its reader accepts",
			stillWritesARecordItsReaderAccepts,
		);
	});
	it.each(ANALYSIS_EXAMPLES_11)(
		"%s",
		async (...[_case, capUsd, ceilingUsd, budgetUsd]) => {
			const directory = await runsDirectory();
			await runStoppedAtBuild(directory);
			const provider = new FakeAnalysisProvider();

			const { record } = await analyzeRun(
				{ capUsd, model: "sonnet", run: RUN, runsDirectory: directory },
				{
					...dependencies(provider.invoke),
					requireSpendCeiling: async () => await Promise.resolve(ceilingUsd),
				},
			);

			expect(provider.budgets).toEqual([budgetUsd]);
			expect(record.capUsd).toBe(budgetUsd);
		},
	);
	it(
		"states the most it can spend before the call",
		statesTheMostItCanSpendBeforeTheCall,
	);
});
describe(analysisSessionArgs.name, () => {
	it(
		"runs the session sealed, under the model and the budget it is given",
		runsTheSessionSealedUnderTheModelAndTheBudgetItIsGiven,
	);
});
