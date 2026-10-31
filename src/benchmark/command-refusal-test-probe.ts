import { refuseCommands, runCommand } from "./command";
import CommandsRefusedError from "./commands-refused-error";

type CommandOutcome = "ran" | "refused";

async function commandOutcome(): Promise<CommandOutcome> {
	try {
		await runCommand(["true"], process.cwd());

		return "ran";
	} catch (error) {
		if (error instanceof CommandsRefusedError) {
			return "refused";
		}

		throw error;
	}
}

/**
 * Runs work that may stop a session command, then lifts the process-wide
 * refusal the stop set, even when the work fails, so no later test inherits
 * it. A release clears the refusal whoever set it.
 */
async function liftingRefusal<T>(work: () => Promise<T>): Promise<T> {
	try {
		return await work();
	} finally {
		refuseCommands()();
	}
}

export { commandOutcome, liftingRefusal };
export type { CommandOutcome };
