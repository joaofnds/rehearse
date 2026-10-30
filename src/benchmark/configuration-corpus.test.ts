import { describe, expect, it } from "bun:test";

import { parseArgs, parseReplayArgs, parseSessionArgs } from "./config";
import { CASE_DEFAULTS, SESSION_ARGS } from "./configuration-test-support";

const knobs = [
	"--model",
	"haiku",
	"--effort",
	"medium",
	"--session-budget-usd",
	"1",
];

function carriesCorpusOntoARunConfiguration(): void {
	const config = parseArgs(
		[...knobs, "--corpus", "/variants/brief"],
		{},
		CASE_DEFAULTS,
	);

	expect(config.corpus).toBe("/variants/brief");
}

function carriesCorpusOntoASessionRunConfiguration(): void {
	const config = parseSessionArgs(
		[...knobs, "--corpus", "/variants/brief"],
		{},
		{ caseId: "smoke" },
	);

	expect(config.corpus).toBe("/variants/brief");
}

function carriesCorpusOntoAReplayConfiguration(): void {
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
}

function leavesTheCorpusAbsentWhenCorpusIsNotGivenWhichIsTheLiveInstall(): void {
	expect(parseArgs(knobs, {}, CASE_DEFAULTS).corpus).toBeUndefined();
	expect(
		parseSessionArgs(knobs, {}, { caseId: "smoke" }).corpus,
	).toBeUndefined();
}

function fallsBackToTheModelAndBudgetTheSessionCaseDeclares(): void {
	const expectedSessionBudgetUsd = 0.2;

	const config = parseSessionArgs(
		[],
		{},
		{
			caseId: "smoke",
			effort: "low",
			model: "declared-model",
			sessionBudgetUsd: 0.2,
		},
	);

	expect(config.model).toBe("declared-model");
	expect(config.effort).toBe("low");
	expect(config.sessionBudgetUsd).toBe(expectedSessionBudgetUsd);
}

function letsModelAndSessionBudgetUsdOverrideTheSessionCaseSDeclaredValues(): void {
	const expectedSessionBudgetUsd = 5;

	const config = parseSessionArgs(
		[...SESSION_ARGS],
		{},
		{ caseId: "smoke", model: "declared-model", sessionBudgetUsd: 0.2 },
	);

	expect(config.model).toBe("sonnet");
	expect(config.sessionBudgetUsd).toBe(expectedSessionBudgetUsd);
}

describe("corpus and session case configuration", () => {
	it(
		"carries --corpus onto a run configuration",
		carriesCorpusOntoARunConfiguration,
	);
	it(
		"carries --corpus onto a session run configuration",
		carriesCorpusOntoASessionRunConfiguration,
	);
	it(
		"carries --corpus onto a replay configuration",
		carriesCorpusOntoAReplayConfiguration,
	);
	it(
		"leaves the corpus absent when --corpus is not given, which is the live install",
		leavesTheCorpusAbsentWhenCorpusIsNotGivenWhichIsTheLiveInstall,
	);
	it(
		"falls back to the model, effort and budget the session case declares",
		fallsBackToTheModelAndBudgetTheSessionCaseDeclares,
	);
	it(
		"lets --model and --session-budget-usd override the session case's declared values",
		letsModelAndSessionBudgetUsdOverrideTheSessionCaseSDeclaredValues,
	);
});
