import { afterEach, describe, expect, it } from "bun:test";
import { join } from "node:path";

import type { BenchmarkConfig } from "#benchmark/config";
import { recordsDirectory } from "#benchmark/config";
import { linkCorpus, unlinkCorpus } from "#benchmark/corpus-source";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { TestResources } from "#benchmark/test-support";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import { runRunCommand } from "#cli/run-command";

import {
	args,
	loadsAuditLog,
	neverASession,
	passingPreflight,
	passingProbe,
	storedCeiling,
} from "./run-command-test-fixture";

const resources = TestResources.forEachTest();

async function refusesPauseBeforeTheRunStartsWhenStdinIs(): Promise<void> {
	const { output, stdout, stderr } = recordOutput();

	const failure = await failureOf(
		runRunCommand(
			{ args: [...args, "--pause"], json: false, stdinIsTerminal: false },
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
	expect(failure.message).toContain("terminal");
	expect(stdout).toEqual([]);
	expect(stderr).toEqual([]);
}

async function refusesAPipelineRunBeforeAnyProviderCallNaming(): Promise<void> {
	const corpus = await resources.createControlDirectory();
	await Bun.write(join(corpus, "CLAUDE.md"), "linked\n");
	await linkCorpus(recordsDirectory(), corpus);

	const failure = await failureOf(
		runRunCommand(
			{ args, json: false, stdinIsTerminal: true },
			{
				assertPreflight: async () =>
					await Promise.reject(new Error("preflight must not run")),
				execute: async () =>
					await Promise.reject(new Error("run must not start")),
				executeSession: neverASession,
				output: recordOutput().output,
				probeModel: passingProbe,
				requireCase: loadsAuditLog().requireCase,
				requireSpendCeiling: storedCeiling,
			},
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain(corpus);
	expect(failure.message).toContain("rehearse settings --unlink-corpus");
}

async function startsWithoutPauseWhenStdinIsNotATerminal(): Promise<void> {
	const expectedExecutedCount = 1;

	const { output } = recordOutput();
	const executed: BenchmarkConfig[] = [];

	await runRunCommand(
		{ args, json: false, stdinIsTerminal: false },
		{
			assertPreflight: passingPreflight,
			execute: async ({ config }) => {
				executed.push(config);

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

	const [observedFirstExecuted] = executed;

	expect(executed).toHaveLength(expectedExecutedCount);
	expect(observedFirstExecuted?.pause).toBe(false);
}

async function loadsTheCaseCaseNamesAndAuditLogWhen(): Promise<void> {
	const loader = loadsAuditLog();
	const { output } = recordOutput();
	const dependencies = {
		assertPreflight: passingPreflight,
		environment: {},
		execute: async () =>
			await Promise.resolve({
				kind: "debug" as const,
				recordFile: "/runs/2026.json",
			}),
		executeSession: neverASession,
		output,
		probeModel: passingProbe,
		requireCase: loader.requireCase,
		requireSpendCeiling: storedCeiling,
	};

	await runRunCommand(
		{ args, json: false, stdinIsTerminal: true },
		dependencies,
	);
	await runRunCommand(
		{
			args: [...args, "--case", "other"],
			json: false,
			stdinIsTerminal: true,
		},
		dependencies,
	);

	expect(loader.loaded).toEqual(["audit-log", "other"]);
}

async function refusesAnUnknownCaseBeforeTheRunStarts(): Promise<void> {
	const { output, stdout } = recordOutput();

	const failure = await failureOf(
		runRunCommand(
			{
				args: [...args, "--case", "missing"],
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
				requireCase: async (id) =>
					await Promise.reject(
						new RefusedPreconditionError(`Unknown case ${id}`),
					),
				requireSpendCeiling: storedCeiling,
			},
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain("missing");
	expect(stdout).toEqual([]);
}

describe(runRunCommand.name, () => {
	it(
		"refuses --pause before the run starts when stdin is not a terminal",
		refusesPauseBeforeTheRunStartsWhenStdinIs,
	);
});

describe(`${runRunCommand.name} > when a directory corpus is linked`, () => {
	afterEach(async () => {
		await unlinkCorpus(recordsDirectory());
	});
	it(
		"refuses a pipeline run before any provider call, naming the link",
		refusesAPipelineRunBeforeAnyProviderCallNaming,
	);
});

describe(runRunCommand.name, () => {
	it(
		"starts without --pause when stdin is not a terminal",
		startsWithoutPauseWhenStdinIsNotATerminal,
	);
	it(
		"loads the case --case names, and audit-log when the flag is absent",
		loadsTheCaseCaseNamesAndAuditLogWhen,
	);
	it(
		"refuses an unknown case before the run starts",
		refusesAnUnknownCaseBeforeTheRunStarts,
	);
});
