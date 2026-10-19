import type { LoadedCase } from "#benchmark/case";
import { parseCaseId, recordsDirectory } from "#benchmark/config";
import { EXIT_CODES } from "#benchmark/exit-codes";
import { requireCase } from "#cli/case-command";
import { dispatch } from "#cli/command-catalog";
import {
	asUsageError,
	commandHelp,
	findCommand,
	parseCommandLine,
} from "#cli/commands";
import { confineIfNeeded, liveConfinementHost } from "#cli/confinement";
import { processOutput } from "#cli/output";

async function executeCommand(argv: readonly string[]): Promise<number> {
	const { command, args } = findCommand(argv);
	const commandLine = parseCommandLine(command, args);
	if (commandLine.helpRequested) {
		processOutput.stdout(commandHelp(command));

		return EXIT_CODES.completed;
	}

	const loadRunCase = async (): Promise<LoadedCase> =>
		await requireCase(asUsageError(() => parseCaseId(commandLine.flags)));
	await confineIfNeeded(
		command.confinement,
		loadRunCase,
		liveConfinementHost(),
	);

	return await dispatch(command.name, {
		commandLine,
		runsDirectory: asUsageError(() => recordsDirectory()),
	});
}
export { executeCommand as default };
