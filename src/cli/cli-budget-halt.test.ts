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
import { pathExists } from "#benchmark/file-presence";

import { pipelineFixture } from "./cli-pipeline-test-fixture";
import {
	CLI_TEST_TIMEOUT_MS,
	runCli,
	runPipelineCli,
} from "./cli-process-test-driver";
import { budgetHaltEvidence, settingsRecords } from "./cli-spend-test-fixture";

const FINAL_PROVIDER_CALL_OFFSET = -1;

setDefaultTimeout(CLI_TEST_TIMEOUT_MS);

const { records, environment: inRecords } = settingsRecords();

const directory = join(records, "execution");

async function stopsTheRunInItsStageRecordsTheStop(): Promise<void> {
	const { control, binDirectory, target } = await pipelineFixture(directory, {
		callCostUsd: 0.6,
		ceilingUsd: 1,
	});

	const result = await runPipelineCli(
		[
			"run",
			"--case",
			"audit-log",
			"--model",
			"sonnet",
			"--target",
			target,
			"--json",
		],
		control,
		binDirectory,
	);

	const { stageRecord, manifest, paidCalls, checkout } =
		await budgetHaltEvidence({ binDirectory, control });
	expect(result.exitCode).toBe(EXIT_CODES.executionFailure);
	expect(stageRecord).toMatchObject({
		ceilingStop: { ceilingUsd: 1, spentUsd: 1.2 },
		stage: "shape",
		status: "STAGE_JUDGE_FAILED",
	});
	expect(paidCalls.at(FINAL_PROVIDER_CALL_OFFSET)).toContain(
		"--max-budget-usd 0.4",
	);
	expect(manifest).toMatchObject({ spendCeilingUsd: 1 });
	expect(await pathExists(checkout)).toBe(false);
}

function whenSpendReachesCeiling(): void {
	beforeEach(async () => {
		await mkdir(directory, { recursive: true });
	});
	it(
		"stops the run in its stage, records the stop, and removes the run's checkout",
		stopsTheRunInItsStageRecordsTheStop,
	);
}

describe("the spend ceiling", () => {
	beforeEach(async () => {
		await mkdir(records, { recursive: true });
	});
	afterEach(async () => {
		await rm(records, { force: true, recursive: true });
	});
	it.each(["0", "0x10", ""])(
		"refuses %p as a ceiling, as a usage error",
		async (ceiling) => {
			const result = await runCli(
				["settings", "--spend-ceiling-usd", ceiling],
				"empty",
				inRecords(),
			);

			expect(result.exitCode).toBe(EXIT_CODES.usageError);
			expect(result.stdout).toBe("");
		},
	);
	describe("when a run's spend reaches it", whenSpendReachesCeiling);
});
