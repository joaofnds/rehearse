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

import { readRootCauseAnalyses } from "#benchmark/root-cause-analysis";
import {
	RUN as DIAGNOSED_RUN,
	runStoppedAtBuild,
} from "#benchmark/root-cause-analysis-test-support";
import { signalExitCode } from "#benchmark/run-abort";

import { eventually, isRunning } from "./cli-confinement-test-fixture";
import { CLI_TEST_TIMEOUT_MS, runCli } from "./cli-process-test-driver";
import { providerShim } from "./cli-provider-test-fixture";
import { settingsRecords } from "./cli-spend-test-fixture";

setDefaultTimeout(CLI_TEST_TIMEOUT_MS);

const { records, environment: inRecords } = settingsRecords();

const callPidFile = join(records, "call.pid");

async function stopsTheCallAndRecordsTheStop(
	signal: NodeJS.Signals,
): Promise<void> {
	const binDirectory = await providerShim({
		directory: records,
		onCall: [`printf '%s' "$$" > '${callPidFile}'`, "exec sleep 30"],
	});
	const diagnose = Bun.spawn(
		[
			process.execPath,
			"rehearse.ts",
			"diagnose",
			DIAGNOSED_RUN,
			"--model",
			"sonnet",
		],
		{
			env: { ...inRecords(), PATH: `${binDirectory}:${Bun.env["PATH"] ?? ""}` },
			stderr: "ignore",
			stdin: new Blob([""]),
			stdout: "ignore",
		},
	);
	await eventually(async () => await Bun.file(callPidFile).exists());
	const pid = Math.trunc(Number(await Bun.file(callPidFile).text()));

	diagnose.kill(signal);

	expect(await diagnose.exited).toBe(signalExitCode(signal));
	expect(isRunning(pid)).toBe(false);
	const { records: analyses } = await readRootCauseAnalyses({
		run: DIAGNOSED_RUN,
		runsDirectory: records,
	});
	expect(analyses).toEqual([
		expect.objectContaining({
			outcome: "failed",
			reason: `stopped by ${signal} before its outcome was recorded; what the call spent is unknown, and it is capped at $1`,
		}),
	]);
}

describe("diagnose", () => {
	beforeEach(async () => {
		await mkdir(records, { recursive: true });
		await runStoppedAtBuild(records);
		await runCli(
			["settings", "--spend-ceiling-usd", "30"],
			"empty",
			inRecords(),
		);
	});
	afterEach(async () => {
		await rm(records, { force: true, recursive: true });
	});
	describe("when a signal arrives during the call", () => {
		it.each(["SIGINT", "SIGTERM", "SIGHUP"] as const)(
			"kills the call, records the stop and exits with %s's code",
			stopsTheCallAndRecordsTheStop,
		);
	});
});
