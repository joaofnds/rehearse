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
import { benchmarkRunsDirectory } from "#benchmark/run-layout";
import { SET_SPEND_CEILING_COMMAND } from "#benchmark/settings";

import { pipelineFixture, recordRunFor } from "./cli-pipeline-test-fixture";
import type { environmentWithoutKnobs } from "./cli-process-test-driver";
import {
	CLI_TEST_TIMEOUT_MS,
	runCli,
	runPipelineCli,
} from "./cli-process-test-driver";
import {
	PROVIDER_CALLS_LOG,
	providerCallsIn,
	providerShim,
} from "./cli-provider-test-fixture";
import { settingsRecords } from "./cli-spend-test-fixture";

setDefaultTimeout(CLI_TEST_TIMEOUT_MS);

const { records, environment: inRecords } = settingsRecords();

const directory = join(records, "execution");

const binDirectory = join(directory, "bin");

const unceiled = (): ReturnType<typeof environmentWithoutKnobs> => ({
	...inRecords(),
	PATH: `${binDirectory}:${Bun.env["PATH"] ?? ""}`,
});

async function isReadBackUnchangedByANewProcessAfter(): Promise<void> {
	await runCli(
		["settings", "--spend-ceiling-usd", "2.5"],
		"empty",
		inRecords(),
	);

	const result = await runCli(["settings", "--json"], "empty", inRecords());

	expect(result.exitCode).toBe(EXIT_CODES.completed);
	expect(JSON.parse(result.stdout)).toEqual({
		recordsDirectory: records,
		spendCeilingUsd: 2.5,
	});
}

interface ReplayApprovalArguments {
	readonly args: readonly string[];
}
async function refusesReplayWithoutCeiling({
	args,
}: ReplayApprovalArguments): Promise<void> {
	const fixture = await pipelineFixture(directory);
	const recorded = await recordRunFor(
		fixture.control,
		fixture.binDirectory,
		fixture.target,
	);
	await rm(join(benchmarkRunsDirectory(fixture.control), "settings.json"));
	await rm(join(fixture.binDirectory, PROVIDER_CALLS_LOG));

	const result = await runPipelineCli(
		[
			"replay",
			"--run",
			recorded,
			"--stage",
			"shape",
			"--model",
			"sonnet",
			"--session-budget-usd",
			"1",
			...args,
		],
		fixture.control,
		fixture.binDirectory,
	);

	expect(result.exitCode).toBe(EXIT_CODES.refusedPrecondition);
	expect(result.stderr).toContain(SET_SPEND_CEILING_COMMAND);
	expect(await providerCallsIn(fixture.binDirectory)).toBe(false);
}

const refusesAKindBeforeAnyProviderCallExamples = [
	{
		args: ["--case", "audit-log", "--target", "/nonexistent-target"],
		kind: "run",
	},
	{
		args: [
			"--case",
			"audit-log",
			"--target",
			"/nonexistent-target",
			"--confirm",
			"--yes",
			"--reps",
			"2",
		],
		kind: "confirmation group",
	},
	{ args: ["--case", "smoke"], kind: "session attempt" },
];

function whenNoCeilingIsStored(): void {
	beforeEach(async () => {
		await mkdir(directory, { recursive: true });
		await providerShim({ directory });
	});
	it.each(refusesAKindBeforeAnyProviderCallExamples)(
		"refuses a $kind before any provider call, naming how to set one",
		async ({ args }) => {
			const result = await runCli(
				["run", ...args, "--model", "sonnet"],
				"empty",
				unceiled(),
			);

			expect(result.exitCode).toBe(EXIT_CODES.refusedPrecondition);
			expect(result.stderr).toContain(SET_SPEND_CEILING_COMMAND);
			expect(await providerCallsIn(binDirectory)).toBe(false);
		},
	);
	it.each([
		{ args: [], kind: "replay" },
		{ args: ["--confirm", "--yes", "--reps", "2"], kind: "replay group" },
	])(
		"refuses a $kind before any provider call, naming how to set one",
		refusesReplayWithoutCeiling,
	);
}

describe("the spend ceiling", () => {
	beforeEach(async () => {
		await mkdir(records, { recursive: true });
	});
	afterEach(async () => {
		await rm(records, { force: true, recursive: true });
	});
	it(
		"is read back unchanged by a new process after one stores it",
		isReadBackUnchangedByANewProcessAfter,
	);
	describe("when none is stored", whenNoCeilingIsStored);
});
