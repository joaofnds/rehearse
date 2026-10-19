import type {
	SessionAttempt,
	SessionAttemptRequest,
} from "#benchmark/session-attempt";
import {
	SessionInputError,
	runSessionAttempt,
} from "#benchmark/session-attempt";
import { RefusedPreconditionError } from "#cli/interactive-stdin";

/**
 * A fixture tree the harness refuses to seed, and a transcript prefix whose
 * bytes are not the ones the case declares, are declared inputs the command
 * cannot satisfy, the same shape of refusal as a corpus file that does not
 * resolve, so they exit 3 rather than as an execution failure.
 */
async function attempted(
	request: SessionAttemptRequest,
): Promise<SessionAttempt> {
	try {
		return await runSessionAttempt(request);
	} catch (error) {
		if (error instanceof SessionInputError) {
			throw new RefusedPreconditionError(error.message);
		}

		throw error;
	}
}

export { attempted as default };
