import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { RefusedPreconditionError } from "#benchmark/exit-codes";
import {
	CliTestWorkspace,
	failureOf,
	recordOutput,
} from "#cli/cli-test-support";
import { runRunCommand } from "#cli/run-command";
import RECORD_JSON_INDENT_SPACES from "#server/json-record-format";

import {
	BenchmarkCaseBuilder,
	args,
	auditLogCase,
	loadsAuditLog,
	neverASession,
	passingPreflight,
	passingProbe,
	storedCeiling,
} from "./run-command-test-fixture";

const workspace = CliTestWorkspace.forEachTest();
const FIRST_EVENT_INDEX = 0;
const LAST_EVENT_INDEX = -1;

async function runsTheConfirmationGroupWithoutATerminalWhenYes(): Promise<void> {
	const { output, stdout } = recordOutput();

	await runRunCommand(
		{
			args: [...args, "--confirm", "--yes"],
			json: false,
			stdinIsTerminal: false,
		},
		{
			assertPreflight: passingPreflight,
			execute: async () =>
				await Promise.resolve({
					kind: "confirmation" as const,
					recordFile: "/runs/report.json",
				}),
			executeSession: neverASession,
			output,
			probeModel: passingProbe,
			requireCase: loadsAuditLog().requireCase,
			requireSpendCeiling: storedCeiling,
		},
	);

	expect(stdout.join("")).toBe("/runs/report.json\n");
}

async function refusesAConfirmationGroupWithoutATerminalWhenYes(): Promise<void> {
	const { output } = recordOutput();

	const failure = await failureOf(
		runRunCommand(
			{
				args: [...args, "--confirm"],
				json: false,
				stdinIsTerminal: false,
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
}

async function printsTheRunArtifactPathOnStdoutAndDiagnostics(): Promise<void> {
	const { output, stdout, stderr } = recordOutput();

	await runRunCommand(
		{ args, json: false, stdinIsTerminal: true },
		{
			assertPreflight: passingPreflight,
			execute: async ({ output: commandOutput }) => {
				commandOutput.stderr("Target: /nonexistent-target\n");

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

	expect(stdout.join("")).toBe("/runs/2026.json\n");
	expect(stderr.join("")).toBe("Target: /nonexistent-target\n");
}

const SAME_FAMILY_JUDGE_ARGUMENTS = [
	"--target",
	"/nonexistent-target",
	"--model",
	"sonnet",
	"--effort",
	"medium",
	"--judge-model",
	"claude-sonnet-4-6",
	"--session-budget-usd",
	"1",
];

const EXPECTED_WARNING_COUNT = 1;

async function warnsOnceOnStderrAboutASameFamilyJudge(): Promise<void> {
	const events: string[] = [];
	const { output, stdout } = recordOutput();

	await runRunCommand(
		{
			args: SAME_FAMILY_JUDGE_ARGUMENTS,
			json: false,
			stdinIsTerminal: true,
		},
		{
			assertPreflight: passingPreflight,
			execute: async () => {
				events.push("execute");

				return await Promise.resolve({
					kind: "debug" as const,
					recordFile: "/runs/2026.json",
				});
			},
			executeSession: neverASession,
			output: {
				stderr: (text) => {
					events.push(text);
					output.stderr(text);
				},
				stdout: output.stdout,
			},
			probeModel: passingProbe,
			requireCase: async (id) => {
				events.push("load-case");

				return await Promise.resolve(
					new BenchmarkCaseBuilder({
						declaration: { ...auditLogCase.declaration, id },
					}).build(),
				);
			},
			requireSpendCeiling: storedCeiling,
		},
	);

	expect(
		events.filter((event) => event.includes("Self-preference warning")),
	).toHaveLength(EXPECTED_WARNING_COUNT);

	expect(events[FIRST_EVENT_INDEX]).toBe("load-case");
	expect(events.at(LAST_EVENT_INDEX)).toBe("execute");
	expect(stdout.join("")).toBe("/runs/2026.json\n");
}

async function printsTheRunArtifactSExactBytesOnStdout(): Promise<void> {
	const directory = await workspace.createDirectory("rehearse-run-json-");
	const recordFile = join(directory, "artifact.json");
	const recordText = `${JSON.stringify({ schemaVersion: 1, status: "COMPLETE" }, null, RECORD_JSON_INDENT_SPACES)}\n`;
	await Bun.write(recordFile, recordText);
	const { output, stdout, stderr } = recordOutput();

	await runRunCommand(
		{ args, json: true, stdinIsTerminal: true },
		{
			assertPreflight: passingPreflight,
			execute: async () =>
				await Promise.resolve({
					kind: "debug" as const,
					recordFile,
				}),
			executeSession: neverASession,
			output,
			probeModel: passingProbe,
			requireCase: loadsAuditLog().requireCase,
			requireSpendCeiling: storedCeiling,
		},
	);

	expect(stdout.join("")).toBe(recordText);
	expect(stdout.join("")).toBe(await Bun.file(recordFile).text());
	expect(stderr).toEqual([]);
}

describe(runRunCommand.name, () => {
	it(
		"runs the confirmation group without a terminal when --yes answers the approval",
		runsTheConfirmationGroupWithoutATerminalWhenYes,
	);
	it(
		"refuses a confirmation group without a terminal when --yes is absent",
		refusesAConfirmationGroupWithoutATerminalWhenYes,
	);
	it(
		"prints the run artifact path on stdout and diagnostics on stderr",
		printsTheRunArtifactPathOnStdoutAndDiagnostics,
	);
	it(
		"warns once on stderr about a same-family Judge before the run starts",
		warnsOnceOnStderrAboutASameFamilyJudge,
	);
	it(
		"prints the run artifact's exact bytes on stdout with --json",
		printsTheRunArtifactSExactBytesOnStdout,
	);
});
