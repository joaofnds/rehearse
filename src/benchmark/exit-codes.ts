import { CommandFailureError } from "./command-failure-error";

export const EXIT_CODES = {
	completed: 0,
	executionFailure: 1,
	usageError: 2,
	refusedPrecondition: 3,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

export function exitCodeFor(error: Readonly<Error>): ExitCode {
	return error instanceof CommandFailureError
		? error.exitCode
		: EXIT_CODES.executionFailure;
}

export class RefusedPreconditionError extends CommandFailureError {
	public readonly exitCode = EXIT_CODES.refusedPrecondition;

	public constructor(message: string) {
		super(message);
		this.name = "RefusedPreconditionError";
	}
}
