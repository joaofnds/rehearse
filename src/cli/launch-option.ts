import { recordsDirectory } from "#benchmark/config";
import { writeLaunchEnding } from "#benchmark/launch-ending";
import { isLaunchId } from "#benchmark/launch-record";

import { processOutput } from "./output";

/**
 * The server starts a browser launch's command with this ahead of it, so the
 * command can record the error it ends by beside the launch. It travels on
 * the argument list rather than in the environment, which every session the
 * command starts would inherit.
 */
const LAUNCH_OPTION = "--launch";

const OPTION_INDEX = 0;

const ID_INDEX = 1;

const COMMAND_START_INDEX = 2;

interface LaunchArguments {
	readonly launchId: string | undefined;
	readonly argv: readonly string[];
}

/**
 * The launch id and the command line after it. Only a well-formed id is taken,
 * so no argument names a path outside the launches directory; any other value
 * stays on the command line, which refuses it as an unknown command.
 */
function takeLaunchOption(argv: readonly string[]): LaunchArguments {
	const id = argv[ID_INDEX];
	if (
		argv[OPTION_INDEX] !== LAUNCH_OPTION ||
		id === undefined ||
		!isLaunchId(id)
	) {
		return { argv, launchId: undefined };
	}

	return { argv: argv.slice(COMMAND_START_INDEX), launchId: id };
}

/**
 * A failed write is reported and goes no further, so the command still ends
 * with the error it ended by.
 */
async function recordLaunchEnding(
	launchId: string,
	failure: Readonly<Error>,
	exitCode: number,
): Promise<void> {
	try {
		await writeLaunchEnding(recordsDirectory(), launchId, {
			endedAt: new Date().toISOString(),
			exitCode,
			message: failure.message,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		processOutput.stderr(`The launch's ending was not recorded: ${message}\n`);
	}
}

export { LAUNCH_OPTION, takeLaunchOption, recordLaunchEnding };
