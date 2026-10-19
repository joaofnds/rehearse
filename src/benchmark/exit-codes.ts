import CommandFailureError from "./command-failure-error";

const EXIT_CODES = {
	completed: 0,
	executionFailure: 1,
	refusedPrecondition: 3,
	usageError: 2,
} as const;

type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

function exitCodeFor(error: Readonly<Error>): ExitCode {
	return error instanceof CommandFailureError
		? error.exitCode
		: EXIT_CODES.executionFailure;
}

class RefusedPreconditionError extends CommandFailureError {
	public readonly exitCode = EXIT_CODES.refusedPrecondition;

	public constructor(message: string) {
		super(message);
		this.name = "RefusedPreconditionError";
	}
}

export { EXIT_CODES, exitCodeFor, RefusedPreconditionError };
export type { ExitCode };
