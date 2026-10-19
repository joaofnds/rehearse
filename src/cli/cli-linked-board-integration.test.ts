import { describe, expect, it, setDefaultTimeout } from "bun:test";
import { readdir, realpath } from "node:fs/promises";
import { join } from "node:path";

import { runCommand } from "#benchmark/command";
import { EXIT_CODES } from "#benchmark/exit-codes";
import { CliTestWorkspace } from "#cli/cli-test-support";

import {
	BOARD_CONFIG,
	linkedBoardFixture,
	retainedCandidateState,
} from "./cli-pipeline-integration-fixture";
import { pipelineFixture } from "./cli-pipeline-test-fixture";
import { CLI_TEST_TIMEOUT_MS, runPipelineCli } from "./cli-process-test-driver";
import { headSha, recordedCheckout } from "./cli-record-observation";

const workspace = CliTestWorkspace.forEachTest();

setDefaultTimeout(CLI_TEST_TIMEOUT_MS);

async function keepsEveryPipelineDiagnosticOffStdoutOnARun(): Promise<void> {
	const directory = await workspace.createDirectory(
		"rehearse-stdout-contract-",
	);
	const { control, binDirectory, target } = await pipelineFixture(directory);

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

	expect(result.stdout).toBe("");
	expect(result.stderr).toContain(`Target: ${await realpath(target)}`);
	expect(result.stderr).toContain("Baseline checks");
	expect(result.stderr).toContain("Run checkout removed.");
	expect(result.exitCode).toBe(EXIT_CODES.executionFailure);
}

async function runsTheBaselineChecksAndReachesTheStages(): Promise<void> {
	const fixture = await linkedBoardFixture(workspace);

	const result = await runPipelineCli(
		[
			"run",
			"--case",
			"audit-log",
			"--model",
			"sonnet",
			"--target",
			fixture.target,
			"--json",
		],
		fixture.control,
		fixture.binDirectory,
	);

	expect(result.stderr).toContain("Baseline checks");
	expect(result.stderr).not.toContain("backlog contains a link");
	expect(result.exitCode).toBe(EXIT_CODES.executionFailure);
}

async function leavesTheTargetSCheckoutAndItsBoardAs(): Promise<void> {
	const fixture = await linkedBoardFixture(workspace);
	const startSha = await headSha(fixture.target);

	await runPipelineCli(
		[
			"run",
			"--case",
			"audit-log",
			"--model",
			"sonnet",
			"--target",
			fixture.target,
			"--json",
		],
		fixture.control,
		fixture.binDirectory,
	);

	const status = await runCommand(
		["git", "status", "--porcelain=v1", "--untracked-files=all"],
		fixture.target,
	);
	expect({
		board: await readdir(fixture.board),
		config: await Bun.file(join(fixture.board, "config.yml")).text(),
		head: await headSha(fixture.target),
		status,
	}).toEqual({
		board: ["config.yml"],
		config: BOARD_CONFIG,
		head: startSha,
		status: "",
	});
}

async function keepsTheRunSCommitsInTheTargetOnce(): Promise<void> {
	const fixture = await linkedBoardFixture(workspace);

	await runPipelineCli(
		[
			"run",
			"--case",
			"audit-log",
			"--model",
			"sonnet",
			"--target",
			fixture.target,
			"--json",
		],
		fixture.control,
		fixture.binDirectory,
	);

	const { run, checkout } = await recordedCheckout(fixture.control);
	expect(
		await retainedCandidateState({ checkout, target: fixture.target }),
	).toEqual({ checkoutRemains: false, retained: `refs/rehearse/${run}` });
}

describe("rehearse", () => {
	it(
		"keeps every pipeline diagnostic off stdout on a run reaching its stages",
		keepsEveryPipelineDiagnosticOffStdoutOnARun,
	);
	describe("when the target's board is a link to a directory outside it", () => {
		it(
			"runs the baseline checks and reaches the stages",
			runsTheBaselineChecksAndReachesTheStages,
		);
		it(
			"leaves the target's checkout and its board as they were",
			leavesTheTargetSCheckoutAndItsBoardAs,
		);
		it(
			"keeps the run's commits in the target once its checkout is gone",
			keepsTheRunSCommitsInTheTargetOnce,
		);
	});
});
