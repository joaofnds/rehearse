#!/usr/bin/env bun
import { assertPinnedBunVersion } from "./src/benchmark/bun-pin";
import { EXIT_CODES, exitCodeFor } from "./src/benchmark/exit-codes";
import { topLevelHelp } from "./src/cli/commands";
import executeCommand from "./src/cli/entry";
import { processOutput } from "./src/cli/output";

const CLI_USER_ARGUMENTS_START_INDEX = 2;
const COMMAND_NAME_INDEX = 0;

async function main(): Promise<number> {
	assertPinnedBunVersion();

	const argv = Bun.argv.slice(CLI_USER_ARGUMENTS_START_INDEX);
	if (argv[COMMAND_NAME_INDEX] === "--help") {
		processOutput.stdout(topLevelHelp());

		return EXIT_CODES.completed;
	}
	if (argv[COMMAND_NAME_INDEX] === undefined) {
		processOutput.stderr(topLevelHelp());

		return EXIT_CODES.usageError;
	}

	return await executeCommand(argv);
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
