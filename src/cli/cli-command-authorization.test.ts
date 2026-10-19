import { describe, expect, it, setDefaultTimeout } from "bun:test";

import { RECORDS_DIRECTORY_VARIABLE } from "#benchmark/config";
import { EXIT_CODES } from "#benchmark/exit-codes";
import { PROJECT_ROOT } from "#benchmark/test-support";

import {
	CLI_TEST_TIMEOUT_MS,
	environmentWithoutKnobs,
	runCli,
} from "./cli-process-test-driver";

const EXPECTED_REFUSAL_EXIT_CODE = 3;
const EXPECTED_USAGE_EXIT_CODE = 2;

setDefaultTimeout(CLI_TEST_TIMEOUT_MS);

async function refusesAnEmptyRecordsLocationWithAUsageExit(): Promise<void> {
	const child = Bun.spawn([process.execPath, "rehearse.ts", "list", "runs"], {
		cwd: PROJECT_ROOT,
		env: { ...environmentWithoutKnobs(), [RECORDS_DIRECTORY_VARIABLE]: "" },
		stderr: "pipe",
		stdout: "pipe",
	});
	const [exitCode, stderr] = await Promise.all([
		child.exited,
		new Response(child.stderr).text(),
	]);

	expect(stderr).toContain("REHEARSE_RECORDS_DIR is empty");
	expect(exitCode).toBe(EXIT_CODES.usageError);
}

async function refusesAnUnknownFlagByNameWithAUsage(): Promise<void> {
	const expectedSplitCount = 1;

	const result = await runCli(["run", "--bogus"]);

	expect(result.exitCode).toBe(EXPECTED_USAGE_EXIT_CODE);
	expect(result.stdout).toBe("");
	expect(result.stderr).toContain("--bogus");
	expect(result.stderr.trim().split("\n")).toHaveLength(expectedSplitCount);
}

async function refusesAConfirmationReplayWithoutYesWhenStdinIs(): Promise<void> {
	const result = await runCli([
		"replay",
		"--run",
		"any-name",
		"--stage",
		"shape",
		"--model",
		"sonnet",
		"--session-budget-usd",
		"1",
		"--confirm",
	]);

	expect(result.exitCode).toBe(EXPECTED_REFUSAL_EXIT_CODE);
	expect(result.stdout).toBe("");
	expect(result.stderr).toContain("stdin is not a terminal");
	expect(result.stderr).not.toContain("Projected budget");
	expect(result.stderr).not.toContain("No replayable run named");
}

async function doesNotRefuseForATerminalWhenYesAnswers(): Promise<void> {
	const result = await runCli([
		"replay",
		"--run",
		"any-name",
		"--stage",
		"shape",
		"--model",
		"sonnet",
		"--session-budget-usd",
		"1",
		"--confirm",
		"--yes",
	]);

	expect(result.exitCode).toBe(EXPECTED_REFUSAL_EXIT_CODE);
	expect(result.stdout).toBe("");
	expect(result.stderr).not.toContain("stdin is not a terminal");
	expect(result.stderr).toContain("No replayable run named any-name");
}

async function refusesPauseWhenStdinIsNotATerminalBefore(): Promise<void> {
	const result = await runCli([
		"run",
		"--pause",
		"--target",
		"/nonexistent-target",
		"--model",
		"sonnet",
		"--session-budget-usd",
		"1",
	]);

	expect(result.exitCode).toBe(EXPECTED_REFUSAL_EXIT_CODE);
	expect(result.stdout).toBe("");
	expect(result.stderr).toContain("stdin is not a terminal");
	expect(result.stderr).toContain("--pause");
	expect(result.stderr).not.toContain("Target:");
}

async function refusesARunAuthorizedOnlyByTheCaseDeclaration(): Promise<void> {
	const result = await runCli(["run"]);

	expect(result.exitCode).toBe(EXIT_CODES.refusedPrecondition);
	expect(result.stdout).toBe("");
	expect(result.stderr).toContain("stdin is not a terminal");
	expect(result.stderr).toContain("--model");
}

async function passesTheDeclarationGateWhenTheModelIsNamed(): Promise<void> {
	const result = await runCli([
		"run",
		"--target",
		"/nonexistent-target",
		"--model",
		"sonnet",
		"--session-budget-usd",
		"1",
	]);

	expect(result.stderr).not.toContain("authorizes the spend");
}

async function passesTheTerminalGateWithoutPause(): Promise<void> {
	const result = await runCli([
		"run",
		"--target",
		"/nonexistent-target",
		"--model",
		"sonnet",
		"--session-budget-usd",
		"1",
	]);

	expect(result.stdout).toBe("");
	expect(result.stderr).not.toContain("stdin is not a terminal");
}

describe("rehearse", () => {
	it(
		"refuses an empty records location with a usage exit code",
		refusesAnEmptyRecordsLocationWithAUsageExit,
	);
	it(
		"refuses an unknown flag by name, with a usage exit code and no stdout",
		refusesAnUnknownFlagByNameWithAUsage,
	);
	it(
		"refuses a confirmation replay without --yes when stdin is not a terminal",
		refusesAConfirmationReplayWithoutYesWhenStdinIs,
	);
	it(
		"does not refuse for a terminal when --yes answers the approval",
		doesNotRefuseForATerminalWhenYesAnswers,
	);
	it(
		"refuses --pause when stdin is not a terminal, before any provider call",
		refusesPauseWhenStdinIsNotATerminalBefore,
	);
	it(
		"refuses a run authorized only by the case declaration when stdin is not a terminal",
		refusesARunAuthorizedOnlyByTheCaseDeclaration,
	);
	it(
		"passes the declaration gate when the model is named on the command line",
		passesTheDeclarationGateWhenTheModelIsNamed,
	);
	it(
		"passes the terminal gate without --pause",
		passesTheTerminalGateWithoutPause,
	);
});

const exits2WithTheReasonOnStderrExamples = [
	{
		args: ["run", "--session-budget-usd"],
		condition: "a flag needs a value it was not given",
		message: "Flag --session-budget-usd needs a value",
	},
	{
		args: [
			"run",
			"--target",
			"/nonexistent",
			"--model",
			"sonnet",
			"--effort",
			"extreme",
			"--session-budget-usd",
			"1",
		],
		condition: "a flag value is unparseable",
		message: "Unsupported effort for workflow: extreme",
	},
	{
		args: ["run", "--model"],
		condition: "a flag is given no value",
		message: "Flag --model needs a value",
	},
];

describe("rehearse", () => {
	it.each(exits2WithTheReasonOnStderrExamples)(
		"exits 2 with the reason on stderr when $condition",
		async ({ args, message }) => {
			const result = await runCli(args);

			expect(result.exitCode).toBe(EXPECTED_USAGE_EXIT_CODE);
			expect(result.stdout).toBe("");
			expect(result.stderr).toContain(message);
		},
	);
});
