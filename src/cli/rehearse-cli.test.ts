import { afterEach, describe, expect, it, setDefaultTimeout } from "bun:test";
import { rm } from "node:fs/promises";

import { COMMANDS } from "#cli/commands";

import {
	CLI_TEST_TIMEOUT_MS,
	runCli,
	runPackageScript,
} from "./cli-process-test-driver";

const EXPECTED_COMPLETED_EXIT_CODE = 0;
const EXPECTED_USAGE_EXIT_CODE = 2;

interface ReportCleanup {
	writtenReportDirectory?: string | undefined;
}

setDefaultTimeout(CLI_TEST_TIMEOUT_MS);

const writtenReportDirectoryCapture: ReportCleanup = {};

async function listsEveryCommandAndTheExitCodeMeaningsIn(): Promise<void> {
	const result = await runCli(["--help"]);

	expect(result.exitCode).toBe(EXPECTED_COMPLETED_EXIT_CODE);
	expect(result.stderr).toBe("");
	for (const command of COMMANDS) {
		expect(result.stdout).toContain(command.name);
		expect(result.stdout).toContain(command.summary);
	}
	expect(result.stdout).toContain("2  usage error");
	expect(result.stdout).toContain("3  refused precondition");
}

async function runsTheSupportedPackageScript(): Promise<void> {
	const result = await runPackageScript(["--help"]);

	expect(result.exitCode).toBe(EXPECTED_COMPLETED_EXIT_CODE);
	expect(result.stdout).toContain("Usage: rehearse <command>");
	const [echoedLine, ...extraLines] = result.stderr.trimEnd().split("\n");
	expect(echoedLine).toContain("run rehearse.ts --help");
	expect(extraLines).toEqual([]);
}

async function printsTheTopLevelHelpOnStderrAndExits(): Promise<void> {
	const result = await runCli([]);

	expect(result.exitCode).toBe(EXPECTED_USAGE_EXIT_CODE);
	expect(result.stdout).toBe("");
	expect(result.stderr).toContain("Usage: rehearse <command>");
	for (const command of COMMANDS) {
		expect(result.stderr).toContain(command.name);
	}
}

describe("rehearse", () => {
	afterEach(async () => {
		if (writtenReportDirectoryCapture.writtenReportDirectory !== undefined) {
			await rm(writtenReportDirectoryCapture.writtenReportDirectory, {
				force: true,
				recursive: true,
			});
			writtenReportDirectoryCapture.writtenReportDirectory = undefined;
		}
	});
	it(
		"lists every command and the exit-code meanings in the top-level help",
		listsEveryCommandAndTheExitCodeMeaningsIn,
	);
	it("runs the supported package script", runsTheSupportedPackageScript);
	it.each(COMMANDS.map((command) => command.name))(
		"prints the flag table for rehearse %s --help",
		async (name) => {
			const command = COMMANDS.find((candidate) => candidate.name === name);
			const result = await runCli([...name.split(" "), "--help"]);

			expect(result.exitCode).toBe(EXPECTED_COMPLETED_EXIT_CODE);
			expect(result.stderr).toBe("");
			for (const flag of command?.flags ?? []) {
				expect(result.stdout).toContain(flag.name);
				expect(result.stdout).toContain(flag.help);
				if (flag.envVar !== undefined) {
					expect(result.stdout).toContain(flag.envVar);
				}
			}
		},
	);
	it(
		"prints the top-level help on stderr and exits 2 with no command",
		printsTheTopLevelHelpOnStderrAndExits,
	);
});
