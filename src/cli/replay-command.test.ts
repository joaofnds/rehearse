import { describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
	CliTestWorkspace,
	failureOf,
	recordOutput,
} from "#cli/cli-test-support";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import { runReplayCommand } from "#cli/replay-command";
import writeReplayableRunManifest from "#cli/replay-test-support";
import RECORD_JSON_INDENT_SPACES from "#server/json-record-format";

const workspace = CliTestWorkspace.forEachTest();

const STORED_SPEND_CEILING_USD = 100;

const sessionArgs = [
	"--model",
	"sonnet",
	"--effort",
	"medium",
	"--judge-model",
	"opus",
	"--session-budget-usd",
	"1",
];

const passingProbe = async (): Promise<void> => {
	await Promise.resolve();
};

const storedCeiling = async (): Promise<number> =>
	await Promise.resolve(STORED_SPEND_CEILING_USD);

async function refusesAConfirmationWithoutYesBeforeResolvingTheRun(): Promise<void> {
	const resolved: string[] = [];
	const { output, stdout, stderr } = recordOutput();

	const failure = await failureOf(
		runReplayCommand(
			{
				args: [
					"--run",
					"any-name",
					"--stage",
					"shape",
					...sessionArgs,
					"--confirm",
				],
				json: false,
				stdinIsTerminal: false,
			},
			{
				execute: async () =>
					await Promise.reject(new Error("replay must not run")),
				output,
				probeModel: passingProbe,
				requireSpendCeiling: storedCeiling,
				resolveRunDirectory: async (name) => {
					resolved.push(name);

					return await Promise.resolve("/runs/any-name");
				},
			},
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(resolved).toEqual([]);
	expect(stdout).toEqual([]);
	expect(stderr.join("")).not.toContain("Projected budget");
}

async function doesNotCheckForATerminalWhenYesAnswers(): Promise<void> {
	const resolved: string[] = [];
	const { output } = recordOutput();

	const failure = await failureOf(
		runReplayCommand(
			{
				args: [
					"--run",
					"any-name",
					"--stage",
					"shape",
					...sessionArgs,
					"--confirm",
					"--yes",
				],
				json: false,
				stdinIsTerminal: false,
			},
			{
				execute: async () =>
					await Promise.reject(new Error("replay must not run")),
				output,
				probeModel: passingProbe,
				requireSpendCeiling: storedCeiling,
				resolveRunDirectory: async (name) => {
					resolved.push(name);

					return await Promise.reject(
						new Error(`No replayable run named ${name}`),
					);
				},
			},
		),
	);

	expect(failure).not.toBeInstanceOf(RefusedPreconditionError);
	expect(String(failure)).toContain("No replayable run named any-name");
	expect(resolved).toEqual(["any-name"]);
}

async function doesNotCheckForATerminalForASingle(): Promise<void> {
	const resolved: string[] = [];
	const { output } = recordOutput();

	const failure = await failureOf(
		runReplayCommand(
			{
				args: ["--run", "any-name", "--stage", "shape", ...sessionArgs],
				json: false,
				stdinIsTerminal: false,
			},
			{
				execute: async () =>
					await Promise.reject(new Error("replay must not run")),
				output,
				probeModel: passingProbe,
				requireSpendCeiling: storedCeiling,
				resolveRunDirectory: async (name) => {
					resolved.push(name);

					return await Promise.reject(
						new Error(`No replayable run named ${name}`),
					);
				},
			},
		),
	);

	expect(failure).not.toBeInstanceOf(RefusedPreconditionError);
	expect(resolved).toEqual(["any-name"]);
}

async function haltsBeforeExecutingWhenTheDeclaredModelIsNot(): Promise<void> {
	const executed: string[] = [];
	const { output } = recordOutput();
	const manifestFile = await writeReplayableRunManifest("any-name-bad-model");

	try {
		const failure = await failureOf(
			runReplayCommand(
				{
					args: [
						"--run",
						"any-name-bad-model",
						"--stage",
						"shape",
						...sessionArgs,
					],
					json: false,
					stdinIsTerminal: true,
				},
				{
					execute: async () => {
						executed.push("executed");

						return await Promise.reject(new Error("replay must not run"));
					},
					output,
					probeModel: async () => {
						await Promise.reject(
							new RefusedPreconditionError("Model sonnet is not available"),
						);
					},
					requireSpendCeiling: storedCeiling,
					resolveRunDirectory: async () =>
						await Promise.resolve("/runs/any-name"),
				},
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(executed).toEqual([]);
	} finally {
		await rm(manifestFile, { force: true });
	}
}

async function printsTheReplayRecordSExactBytesOnStdout(): Promise<void> {
	const directory = await workspace.createDirectory("rehearse-replay-json-");
	const recordPath = join(directory, "replay.json");
	const recordText = `${JSON.stringify({ schemaVersion: 1, stage: "shape" }, null, RECORD_JSON_INDENT_SPACES)}\n`;
	await Bun.write(recordPath, recordText);
	workspace.track(await writeReplayableRunManifest("any-name-json"));
	const { output, stdout } = recordOutput();

	await runReplayCommand(
		{
			args: ["--run", "any-name-json", "--stage", "shape", ...sessionArgs],
			json: true,
			stdinIsTerminal: false,
		},
		{
			execute: async (_replay, { output: commandOutput }) => {
				commandOutput.stderr("Replay progress\n");

				return await Promise.resolve({
					evidence: { lineage: "lineage-1", recordPath },
					kind: "debug" as const,
				});
			},
			output,
			probeModel: passingProbe,
			requireSpendCeiling: storedCeiling,
			resolveRunDirectory: async () => await Promise.resolve("/runs/any-name"),
		},
	);

	expect(stdout.join("")).toBe(recordText);
	expect(stdout.join("")).toBe(await Bun.file(recordPath).text());
}

describe(runReplayCommand.name, () => {
	it(
		"refuses a confirmation without --yes before resolving the run, when stdin is not a terminal",
		refusesAConfirmationWithoutYesBeforeResolvingTheRun,
	);
	it(
		"does not check for a terminal when --yes answers the approval",
		doesNotCheckForATerminalWhenYesAnswers,
	);
	it(
		"does not check for a terminal for a single debug rep",
		doesNotCheckForATerminalForASingle,
	);
	it(
		"halts before executing when the declared model is not available",
		haltsBeforeExecutingWhenTheDeclaredModelIsNot,
	);
	it(
		"prints the replay record's exact bytes on stdout with --json",
		printsTheReplayRecordSExactBytesOnStdout,
	);
});
