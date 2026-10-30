import { describe, expect, it } from "bun:test";

import type { BenchmarkCase } from "#benchmark/case";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import type { PipelinePreflightInputs } from "#benchmark/preflight";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import { runRunCommand } from "#cli/run-command";

import {
	BenchmarkCaseBuilder,
	args,
	auditLogCase,
	loadedStageSettings,
	loadsAuditLog,
	neverASession,
	passingPreflight,
	passingProbe,
	storedCeiling,
} from "./run-command-test-fixture";

async function runsTheTargetTheCaseDeclaresWhenNoFlag(): Promise<void> {
	const targets: string[] = [];
	const { output } = recordOutput();

	await runRunCommand(
		{
			args: [
				"--model",
				"sonnet",
				"--effort",
				"medium",
				"--session-budget-usd",
				"1",
			],
			json: false,
			stdinIsTerminal: true,
		},
		{
			assertPreflight: passingPreflight,
			environment: {},
			execute: async ({ config }) => {
				targets.push(config.sourceDir);

				return await Promise.resolve({
					kind: "debug" as const,
					recordFile: "/runs/2026.json",
				});
			},
			executeSession: neverASession,
			output,
			probeModel: passingProbe,
			requireCase: loadsAuditLog().requireCase,
			requireSpendCeiling: storedCeiling,
		},
	);

	expect(targets).toEqual(["/declared/target"]);
}

async function passesTheSettingsLoadedByPreflightIntoTheRun(): Promise<void> {
	const preflighted: PipelinePreflightInputs[] = [];
	const executedWith: unknown[] = [];
	const { output } = recordOutput();

	await runRunCommand(
		{ args, json: false, stdinIsTerminal: true },
		{
			assertPreflight: async (inputs) => {
				preflighted.push(inputs);

				return await Promise.resolve(loadedStageSettings);
			},
			execute: async ({ loadedSettings: settings }) => {
				executedWith.push(settings);

				return await Promise.resolve({
					kind: "debug" as const,
					recordFile: "/runs/2026.json",
				});
			},
			executeSession: neverASession,
			output,
			probeModel: passingProbe,
			requireCase: loadsAuditLog().requireCase,
			requireSpendCeiling: storedCeiling,
		},
	);

	expect(preflighted).toEqual([
		{
			model: "sonnet",
			settingsFilePath: "/control/stage-settings.json",
			sourceDir: "/nonexistent-target",
		},
	]);
	expect(executedWith).toEqual([loadedStageSettings]);
}

async function handsTheRunTheCaseItLoadedWithThe(): Promise<void> {
	const executed: BenchmarkCase[] = [];
	const { output } = recordOutput();

	await runRunCommand(
		{ args, json: false, stdinIsTerminal: true },
		{
			assertPreflight: passingPreflight,
			execute: async ({ benchmarkCase }) => {
				executed.push(benchmarkCase);

				return await Promise.resolve({
					kind: "debug" as const,
					recordFile: "/runs/2026.json",
				});
			},
			executeSession: neverASession,
			output,
			probeModel: passingProbe,
			requireCase: loadsAuditLog().requireCase,
			requireSpendCeiling: storedCeiling,
		},
	);

	expect(executed).toEqual([auditLogCase]);
}

async function recordsTheOverridingPipelinePathWhenPipelineNamesAnother(): Promise<void> {
	const recorded: string[] = [];
	const { output } = recordOutput();

	await runRunCommand(
		{
			args: [...args, "--pipeline", "cases/audit-log/pipelines/other.json"],
			json: false,
			stdinIsTerminal: true,
		},
		{
			assertPreflight: passingPreflight,
			execute: async ({ config }) => {
				recorded.push(config.pipelinePath);

				return await Promise.resolve({
					kind: "debug" as const,
					recordFile: "/runs/2026.json",
				});
			},
			executeSession: neverASession,
			output,
			probeModel: passingProbe,
			requireCase: async () =>
				await Promise.resolve(
					new BenchmarkCaseBuilder({
						pipelinePath: "cases/audit-log/pipelines/other.json",
					}).build(),
				),
			requireSpendCeiling: storedCeiling,
		},
	);

	expect(recorded).toEqual(["cases/audit-log/pipelines/other.json"]);
}

async function refusesAPipelineNamingAFileThatIsNot(): Promise<void> {
	const { output, stdout, stderr } = recordOutput();

	const failure = await failureOf(
		runRunCommand(
			{
				args: [...args, "--pipeline", "cases/audit-log/pipelines/missing.json"],
				json: false,
				stdinIsTerminal: true,
			},
			{
				assertPreflight: passingPreflight,
				execute: async () =>
					await Promise.reject(new Error("run must not start")),
				executeSession: neverASession,
				output,
				probeModel: passingProbe,
				requireCase: loadsAuditLog().requireCase,
				requireSpendCeiling: storedCeiling,
			},
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain("missing.json");
	expect(stdout).toEqual([]);
	expect(stderr).toEqual([]);
}

describe(runRunCommand.name, () => {
	it(
		"runs the target the case declares when no flag or environment names one",
		runsTheTargetTheCaseDeclaresWhenNoFlag,
	);
	it(
		"passes the settings loaded by preflight into the run",
		passesTheSettingsLoadedByPreflightIntoTheRun,
	);
	it(
		"hands the run the case it loaded, with the case's own pipeline",
		handsTheRunTheCaseItLoadedWithThe,
	);
	it(
		"records the overriding pipeline path when --pipeline names another file",
		recordsTheOverridingPipelinePathWhenPipelineNamesAnother,
	);
	it(
		"refuses a --pipeline naming a file that is not there, before the run starts",
		refusesAPipelineNamingAFileThatIsNot,
	);
});
