import CommandFailureError from "#benchmark/command-failure-error";
import { EXIT_CODES } from "#benchmark/exit-codes";

class UsageError extends CommandFailureError {
	public readonly exitCode = EXIT_CODES.usageError;

	public constructor(message: string) {
		super(message);
		this.name = "UsageError";
	}
}

/**
 * Configuration parsing rejects a missing or unparseable flag value with a
 * plain error; at this boundary that is a usage error, and the exit code has
 * to say so.
 */
function asUsageError<Parsed>(parse: () => Parsed): Parsed {
	try {
		return parse();
	} catch (error) {
		throw new UsageError(
			error instanceof Error ? error.message : String(error),
		);
	}
}

/**
 * Parsing a corpus source reads the filesystem to tell whether the directory
 * holds a corpus, so its rejection arrives as a rejected promise rather than a
 * throw; at this boundary it is the same usage error.
 */
async function asUsageErrorAsync<Parsed>(
	parse: () => Promise<Parsed>,
): Promise<Parsed> {
	try {
		return await parse();
	} catch (error) {
		throw new UsageError(
			error instanceof Error ? error.message : String(error),
		);
	}
}
export { asUsageError, asUsageErrorAsync, UsageError };
