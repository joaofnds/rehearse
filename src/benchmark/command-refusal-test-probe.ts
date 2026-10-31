import { refuseCommands, runCommand } from "./command";
import CommandsRefusedError from "./commands-refused-error";

type CommandOutcome = "ran" | "refused";

/** Refuses commands for one test and lifts the refusal when it ends. */
class CommandRefusalProbe {
	private release: (() => void) | undefined = undefined;

	public readonly refuse = (): (() => void) => {
		this.release = refuseCommands();

		return this.release;
	};

	public static async outcome(): Promise<CommandOutcome> {
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

	public lift(): void {
		this.release?.();
	}
}

export { CommandRefusalProbe as default };
export type { CommandOutcome };
