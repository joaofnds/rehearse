import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	setDefaultTimeout,
} from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { EXIT_CODES } from "#benchmark/exit-codes";
import {
	RUN as DIAGNOSED_RUN,
	runStoppedAtBuild,
} from "#benchmark/root-cause-analysis-test-support";
import { SET_SPEND_CEILING_COMMAND } from "#benchmark/settings";

import type { environmentWithoutKnobs } from "./cli-process-test-driver";
import { CLI_TEST_TIMEOUT_MS, runCli } from "./cli-process-test-driver";
import {
	PROVIDER_CALLS_LOG,
	providerCallsIn,
	providerShim,
} from "./cli-provider-test-fixture";
import { settingsRecords } from "./cli-spend-test-fixture";

setDefaultTimeout(CLI_TEST_TIMEOUT_MS);

const { records, environment: inRecords } = settingsRecords();

const binDirectory = join(records, "bin");

const shimmed = (): ReturnType<typeof environmentWithoutKnobs> => ({
	...inRecords(),
	PATH: `${binDirectory}:${Bun.env["PATH"] ?? ""}`,
});

async function refusesBeforeAnyProviderCallWhenNoCeilingIs(): Promise<void> {
	const result = await runCli(
		["diagnose", DIAGNOSED_RUN, "--model", "sonnet"],
		"empty",
		shimmed(),
	);

	expect(result.exitCode).toBe(EXIT_CODES.refusedPrecondition);
	expect(result.stderr).toContain(SET_SPEND_CEILING_COMMAND);
	expect(await providerCallsIn(binDirectory)).toBe(false);
}

async function makesOneSealedCallCappedAtTheBudget(): Promise<void> {
	const expectedSplitCount = 1;

	await runCli(["settings", "--spend-ceiling-usd", "30"], "empty", inRecords());

	await runCli(
		["diagnose", DIAGNOSED_RUN, "--model", "sonnet"],
		"empty",
		shimmed(),
	);

	const calls = await Bun.file(join(binDirectory, PROVIDER_CALLS_LOG)).text();
	expect(calls.trim().split("\n")).toHaveLength(expectedSplitCount);
	expect(calls).toContain("--max-budget-usd 1");
	expect(calls).toContain("--safe-mode");
	expect(calls).toContain("--model sonnet");
}

describe("the spend ceiling", () => {
	beforeEach(async () => {
		await mkdir(records, { recursive: true });
	});
	afterEach(async () => {
		await rm(records, { force: true, recursive: true });
	});
	describe("when an ended run is analyzed", () => {
		beforeEach(async () => {
			await runStoppedAtBuild(records);
			await providerShim({ directory: records });
		});
		it(
			"refuses before any provider call when no ceiling is stored",
			refusesBeforeAnyProviderCallWhenNoCeilingIs,
		);
		it(
			"makes one sealed call capped at the budget",
			makesOneSealedCallCappedAtTheBudget,
		);
	});
});
