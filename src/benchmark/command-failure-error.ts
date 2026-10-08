import type { ExitCode } from "./exit-codes";

/**
 * A failure that names the command's exit code. Other errors exit as an
 * execution failure even when they carry an exit code of their own, such as a
 * failed git command's.
 */
export abstract class CommandFailureError extends Error {
	public abstract readonly exitCode: ExitCode;

	public constructor(message: string) {
		super(message);
		this.name = "CommandFailureError";
	}
}
