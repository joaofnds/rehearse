import type { ErrorHandler } from "hono";

import { UnlistedCorpusFileError } from "#benchmark/corpus-edit";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import CorpusEditBusyError from "#server/corpus-edit-busy-error";
import {
	HTTP_STATUS_CONFLICT,
	HTTP_STATUS_INTERNAL_SERVER_ERROR,
	HTTP_STATUS_NOT_FOUND,
} from "#server/http-status";
import type { HTTP_STATUS_BAD_REQUEST } from "#server/http-status";
import { redactAbsolutePaths } from "#server/redact-path";

/**
 * Why a launch was not started: a request the dialog never sends is 400, a
 * case, run or stage that is not recorded is 404, and one that is recorded but
 * cannot be started as it stands is 409.
 */
class LaunchRefusalError extends Error {
	public override name = "LaunchRefusalError";

	public constructor(
		message: string,
		public readonly status:
			| typeof HTTP_STATUS_BAD_REQUEST
			| typeof HTTP_STATUS_NOT_FOUND
			| typeof HTTP_STATUS_CONFLICT,
	) {
		super(message);
	}
}

/** A precondition the CLI would refuse on refuses the launch, redacted. */
async function asLaunchRefusal<T>(read: () => Promise<T>): Promise<T> {
	try {
		return await read();
	} catch (error) {
		if (!(error instanceof RefusedPreconditionError)) {
			throw error;
		}

		throw new LaunchRefusalError(
			redactAbsolutePaths(error.message),
			HTTP_STATUS_CONFLICT,
		);
	}
}

/** The corpus edit gate refusing the work is 409, as a precondition is. */
async function asBusyRefusal<T>(work: () => Promise<T>): Promise<T> {
	try {
		return await work();
	} catch (error) {
		if (error instanceof CorpusEditBusyError) {
			throw new LaunchRefusalError(error.message, HTTP_STATUS_CONFLICT);
		}

		throw error;
	}
}

/**
 * An edit to a file the report does not list is 404, a busy gate 409, and a
 * precondition the edit cannot meet 409, as `asLaunchRefusal` maps it.
 */
async function asCorpusEditRefusal<T>(read: () => Promise<T>): Promise<T> {
	try {
		return await asBusyRefusal(async () => await asLaunchRefusal(read));
	} catch (error) {
		if (error instanceof UnlistedCorpusFileError) {
			throw new LaunchRefusalError(
				redactAbsolutePaths(error.message),
				HTTP_STATUS_NOT_FOUND,
			);
		}

		throw error;
	}
}

const unexpectedLaunchError: ErrorHandler = (caughtError, context) => {
	const message =
		caughtError instanceof Error ? caughtError.message : String(caughtError);

	return context.json(
		{ error: redactAbsolutePaths(message) },
		HTTP_STATUS_INTERNAL_SERVER_ERROR,
	);
};

export {
	LaunchRefusalError,
	asLaunchRefusal,
	asBusyRefusal,
	asCorpusEditRefusal,
	unexpectedLaunchError,
};
