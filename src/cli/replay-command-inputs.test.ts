import { describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";

import { loadCase } from "#benchmark/case";
import { corpusLayoutRoots } from "#benchmark/checkpoint";
import { CONTROL_DIR, RECORDS_DIRECTORY_VARIABLE } from "#benchmark/config";
import { EXIT_CODES } from "#benchmark/exit-codes";
import { DEFAULT_STAGE_SETTINGS_FILE } from "#benchmark/stage-settings";
import {
	replayCorpusRoots,
	replayDeclaredTarget,
	replaySettingsFile,
	runReplayCommand,
} from "#cli/replay-command";
import writeReplayableRunManifest from "#cli/replay-test-support";

async function searchesTheTargetTheReplayedRunWasClonedFrom(): Promise<void> {
	const manifestFile = await writeReplayableRunManifest(
		"any-name-corpus-roots",
	);

	try {
		expect(
			await replayCorpusRoots(manifestFile, {
				backingRoot: "/backing",
				kind: "live",
				root: "/live",
			}),
		).toEqual(
			corpusLayoutRoots("/tmp/target", {
				backingRoot: "/backing",
				kind: "live",
				root: "/live",
			}),
		);
	} finally {
		await rm(manifestFile, { force: true });
	}
}

async function loadsTheSettingsFileTheReplayedRunSCase(): Promise<void> {
	const manifestFile = await writeReplayableRunManifest(
		"any-name-settings-file",
	);

	try {
		const settingsFile = await replaySettingsFile(manifestFile);

		expect(settingsFile.hashed.path).toBe(DEFAULT_STAGE_SETTINGS_FILE);
	} finally {
		await rm(manifestFile, { force: true });
	}
}

async function namesTheTargetAFreshRunOfTheReplayed(): Promise<void> {
	const manifestFile = await writeReplayableRunManifest(
		"any-name-declared-target",
	);

	try {
		const target = await replayDeclaredTarget(manifestFile);

		expect(await loadCase("audit-log")).toMatchObject({
			kind: "pipeline",
			targetPath: target,
		});
	} finally {
		await rm(manifestFile, { force: true });
	}
}

describe(replayCorpusRoots.name, () => {
	it(
		"searches the target the replayed run was cloned from, not its checkout or the control repository",
		searchesTheTargetTheReplayedRunWasClonedFrom,
	);
});

describe(replaySettingsFile.name, () => {
	it(
		"loads the settings file the replayed run's case declares today",
		loadsTheSettingsFileTheReplayedRunSCase,
	);
});

describe(replayDeclaredTarget.name, () => {
	it(
		"names the target a fresh run of the replayed run's case would use, not the one the run recorded",
		namesTheTargetAFreshRunOfTheReplayed,
	);
});

const invalidRecordsReplay = `
import { runReplayCommand } from "./src/cli/replay-command.ts";
const SCRIPT_ARGUMENTS_START_INDEX = 1;
const unexpected = async () =>
	await Promise.reject(new Error("a later replay boundary must not run"));
try {
	await runReplayCommand(
		{ args: process.argv.slice(SCRIPT_ARGUMENTS_START_INDEX), json: false, stdinIsTerminal: false },
		{
			execute: unexpected,
			output: { stderr: () => {}, stdout: () => {} },
			probeModel: unexpected,
			requireSpendCeiling: unexpected,
			resolveRunDirectory: unexpected,
		},
	);
	process.stdout.write(JSON.stringify({ name: "unexpected success" }));
} catch (error) {
	process.stdout.write(JSON.stringify({ message: error.message, name: error.name }));
}
`;

const replayInputRefusals = [
	{
		args: [],
		message: "Provide --run with the run's name",
		name: "UsageError",
	},
	{
		args: ["--run", "any-name", "--confirm"],
		message:
			"stdin is not a terminal: approving the projected cost needs a TTY; pass --yes instead",
		name: "RefusedPreconditionError",
	},
];

describe(`${runReplayCommand.name} with an invalid records location`, () => {
	it.each(replayInputRefusals)(
		"preserves $name before reading records",
		async ({ args, message, name }) => {
			const child = Bun.spawn(
				[process.execPath, "--eval", invalidRecordsReplay, "--", ...args],
				{
					cwd: CONTROL_DIR,
					env: { ...Bun.env, [RECORDS_DIRECTORY_VARIABLE]: "" },
					stderr: "pipe",
					stdout: "pipe",
				},
			);

			const [exitCode, stdout, stderr] = await Promise.all([
				child.exited,
				new Response(child.stdout).text(),
				new Response(child.stderr).text(),
			]);

			expect(exitCode).toBe(EXIT_CODES.completed);
			expect(stderr).toBe("");
			expect(JSON.parse(stdout)).toEqual({ message, name });
		},
	);
});
