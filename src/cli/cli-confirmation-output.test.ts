import { describe, expect, it, setDefaultTimeout } from "bun:test";

import { EXIT_CODES } from "#benchmark/exit-codes";
import { CliTestWorkspace } from "#cli/cli-test-support";

import { pipelineFixture, recordRunFor } from "./cli-pipeline-test-fixture";
import { CLI_TEST_TIMEOUT_MS, runPipelineCli } from "./cli-process-test-driver";
import {
	preservedEvidenceIn,
	reportBesideGroupIn,
} from "./cli-record-observation";

const workspace = CliTestWorkspace.forEachTest();

const EXPECTED_COMPLETED_EXIT_CODE = 0;

setDefaultTimeout(CLI_TEST_TIMEOUT_MS);

async function keepsEveryReplayDiagnosticOffStdoutOnARecorded(): Promise<void> {
	const directory = await workspace.createDirectory(
		"rehearse-replay-contract-",
	);
	const { control, binDirectory, target } = await pipelineFixture(directory);
	const recorded = await recordRunFor(control, binDirectory, target);

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
			"--json",
		],
		control,
		binDirectory,
	);

	workspace.track(...preservedEvidenceIn(result.stderr));

	expect(result.stdout).toBe("");
	expect(result.stderr).toContain("Checkpoint chain is fresh");
	expect(result.stderr).toContain("shape stage Judge");
	expect(result.stderr).toContain("evidence preserved at");
	expect(result.exitCode).toBe(EXIT_CODES.executionFailure);
}

async function putsTheConfirmationReportSOwnBytesOnStdout(): Promise<void> {
	const directory = await workspace.createDirectory(
		"rehearse-record-contract-",
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
			"--confirm",
			"--yes",
			"--reps",
			"2",
			"--json",
		],
		control,
		binDirectory,
	);

	expect(result.exitCode).toBe(EXPECTED_COMPLETED_EXIT_CODE);
	expect(result.stdout).toBe(
		await Bun.file(reportBesideGroupIn(result.stderr)).text(),
	);
	expect(result.stderr).toContain("Target setup");
	expect(result.stderr).toContain("Baseline checks");
}

async function putsTheReplayReportSOwnBytesOnStdout(): Promise<void> {
	const directory = await workspace.createDirectory("rehearse-replay-record-");
	const { control, binDirectory, target } = await pipelineFixture(directory);
	const recorded = await recordRunFor(control, binDirectory, target);

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
			"--confirm",
			"--yes",
			"--reps",
			"2",
			"--json",
		],
		control,
		binDirectory,
	);

	workspace.track(...preservedEvidenceIn(result.stderr));

	expect(result.exitCode).toBe(EXPECTED_COMPLETED_EXIT_CODE);
	expect(result.stdout).toBe(
		await Bun.file(reportBesideGroupIn(result.stderr)).text(),
	);
}

describe("rehearse", () => {
	it(
		"keeps every replay diagnostic off stdout on a recorded run",
		keepsEveryReplayDiagnosticOffStdoutOnARecorded,
	);
	it(
		"puts the confirmation report's own bytes on stdout and nothing else",
		putsTheConfirmationReportSOwnBytesOnStdout,
	);
	it(
		"puts the replay report's own bytes on stdout and nothing else",
		putsTheReplayReportSOwnBytesOnStdout,
	);
});
