#!/usr/bin/env bun
import { parseStaleArgs, recordsDirectory } from "./src/benchmark/config";
import { assertPinnedBunVersion } from "./src/benchmark/bun-pin";
import {
	requireCase,
	runCaseCapture,
	runCaseList,
	runCaseShow,
} from "./src/cli/case-command";
import { claudeProjectsDirectory } from "./src/benchmark/session-capture";
import { runCompare } from "./src/cli/compare-command";
import {
	executeReplay,
	resolveRunDirectory,
	runReplayCommand,
} from "./src/cli/replay-command";
import {
	executeRun,
	executeSessionRun,
	runRunCommand,
} from "./src/cli/run-command";
import type { CommandLine } from "./src/cli/commands";
import {
	asUsageError,
	commandHelp,
	findCommand,
	parseCommandLine,
	topLevelHelp,
} from "./src/cli/commands";
import { EXIT_CODES, exitCodeFor } from "./src/benchmark/exit-codes";
import {
	assertPipelinePreflight,
	defaultAssertModelAvailable,
	defaultProbeModel,
} from "./src/benchmark/preflight";
import { runList } from "./src/cli/list-command";
import { judgesFor, runCalibrate } from "./src/cli/calibrate-command";
import { runReview } from "./src/cli/review-command";
import { runShow } from "./src/cli/show-command";
import { runRegrade } from "./src/cli/regrade-command";
import { runStale } from "./src/cli/stale-command";
import { processOutput } from "./src/cli/output";

function main(): Promise<number> {
	assertPinnedBunVersion();

	const argv = Bun.argv.slice(2);
	const [name] = argv;
	if (name === "--help") {
		processOutput.stdout(topLevelHelp());

		return Promise.resolve(EXIT_CODES.completed);
	}
	if (name === undefined) {
		processOutput.stderr(topLevelHelp());

		return Promise.resolve(EXIT_CODES.usageError);
	}

	const { command, args } = findCommand(argv);
	const commandLine = parseCommandLine(command, args);
	if (commandLine.helpRequested) {
		processOutput.stdout(commandHelp(command));

		return Promise.resolve(EXIT_CODES.completed);
	}

	return dispatch(command.name, commandLine);
}

function flagValue(flags: readonly string[], name: string): string | undefined {
	const index = flags.indexOf(name);

	return index === -1 ? undefined : flags[index + 1];
}

/**
 * A flag the caller may repeat, in the order they gave it: `--finding` names
 * one finding each time, and a review records them in that order.
 */
function repeatedFlagValues(
	flags: readonly string[],
	name: string,
): readonly string[] {
	const values: string[] = [];
	for (const [index, flag] of flags.entries()) {
		const value = flags[index + 1];
		if (flag === name && value !== undefined) {
			values.push(value);
		}
	}

	return values;
}

async function dispatch(
	name: string,
	commandLine: CommandLine,
): Promise<number> {
	switch (name) {
		case "review": {
			await runReview(
				{
					id: commandLine.argument,
					runsDirectory: recordsDirectory(),
					json: commandLine.json,
					file: flagValue(commandLine.flags, "--file"),
					verdict: flagValue(commandLine.flags, "--verdict"),
					summary: flagValue(commandLine.flags, "--summary"),
					findings: repeatedFlagValues(commandLine.flags, "--finding"),
				},
				processOutput,
			);

			return EXIT_CODES.completed;
		}
		case "calibrate": {
			await runCalibrate(
				{
					id: commandLine.argument,
					runsDirectory: recordsDirectory(),
					json: commandLine.json,
					confirmRejudge: commandLine.flags.includes("--confirm-rejudge"),
				},
				{
					buildJudges: judgesFor,
					output: processOutput,
					probeModel: defaultAssertModelAvailable,
				},
			);

			return EXIT_CODES.completed;
		}
		case "compare": {
			await runCompare(
				{
					manifestPath: commandLine.argument,
					runsDirectory: recordsDirectory(),
					json: commandLine.json,
				},
				processOutput,
			);

			return EXIT_CODES.completed;
		}
		case "replay": {
			await runReplayCommand(
				{
					args: commandLine.flags,
					json: commandLine.json,
					stdinIsTerminal: process.stdin.isTTY,
				},
				{
					output: processOutput,
					resolveRunDirectory,
					probeModel: defaultAssertModelAvailable,
					execute: executeReplay,
				},
			);

			return EXIT_CODES.completed;
		}
		case "run": {
			await runRunCommand(
				{
					args: commandLine.flags,
					json: commandLine.json,
					stdinIsTerminal: process.stdin.isTTY,
				},
				{
					output: processOutput,
					requireCase,
					assertPreflight: assertPipelinePreflight,
					probeModel: defaultProbeModel,
					execute: executeRun,
					executeSession: executeSessionRun,
				},
			);

			return EXIT_CODES.completed;
		}
		case "list": {
			await runList(
				{
					kind: commandLine.argument,
					runsDirectory: recordsDirectory(),
				},
				processOutput,
			);

			return EXIT_CODES.completed;
		}
		case "show": {
			await runShow(
				{
					id: commandLine.argument,
					json: commandLine.json,
					runsDirectory: recordsDirectory(),
					checkout: flagValue(commandLine.flags, "--checkout"),
				},
				processOutput,
			);

			return EXIT_CODES.completed;
		}
		case "regrade": {
			await runRegrade(
				{
					id: commandLine.argument,
					runsDirectory: recordsDirectory(),
					json: commandLine.json,
				},
				{
					output: processOutput,
					requireCase,
					now: () => new Date().toISOString(),
				},
			);

			return EXIT_CODES.completed;
		}
		case "stale": {
			await runStale(
				{
					...asUsageError(() => parseStaleArgs(commandLine.flags)),
					runsDirectory: recordsDirectory(),
				},
				{ output: processOutput },
			);

			return EXIT_CODES.completed;
		}
		case "case list": {
			await runCaseList({ json: commandLine.json }, processOutput);

			return EXIT_CODES.completed;
		}
		case "case show": {
			await runCaseShow(
				{ caseId: commandLine.argument, json: commandLine.json },
				processOutput,
			);

			return EXIT_CODES.completed;
		}
		case "case capture": {
			await runCaseCapture(
				{
					caseId: commandLine.argument,
					session: flagValue(commandLine.flags, "--session"),
					cut: flagValue(commandLine.flags, "--cut"),
					json: commandLine.json,
				},
				{
					projectsDirectory: claudeProjectsDirectory(),
					runsDirectory: recordsDirectory(),
					output: processOutput,
				},
			);

			return EXIT_CODES.completed;
		}
		default: {
			throw new Error(`Command ${name} is declared but not wired up`);
		}
	}
}

/**
 * `process.exit` drops whatever `process.stdout.write` has still buffered, and
 * on a pipe that write is asynchronous, so a record larger than the pipe
 * buffer arrives cut in half. Setting the code lets the process end once the
 * write has drained.
 */
if (import.meta.main) {
	try {
		process.exitCode = await main();
	} catch (error) {
		const failure = error instanceof Error ? error : new Error(String(error));
		processOutput.stderr(`${failure.message}\n`);
		process.exitCode = exitCodeFor(failure);
	}
}
