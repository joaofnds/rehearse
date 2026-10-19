import type { RefusedPreconditionError } from "#benchmark/exit-codes";
import { UsageError } from "#cli/commands";
import {
	HTTP_STATUS_BAD_REQUEST,
	HTTP_STATUS_NOT_FOUND,
} from "#server/http-status";
import { redactAbsolutePaths } from "#server/redact-path";

interface HistoryErrorView {
	readonly kind: "not-found" | "refused";
	readonly message: string;
}

interface HistoryErrorResponse {
	readonly message: string;
	readonly status:
		| typeof HTTP_STATUS_BAD_REQUEST
		| typeof HTTP_STATUS_NOT_FOUND;
}

function historyError(error: HistoryErrorView): HistoryErrorResponse {
	return {
		message: redactAbsolutePaths(error.message),
		status:
			error.kind === "not-found"
				? HTTP_STATUS_NOT_FOUND
				: HTTP_STATUS_BAD_REQUEST,
	};
}

/** A malformed argument is 400 and a record that is not there is 404. */
function commandRefusal(
	error: Readonly<UsageError> | Readonly<RefusedPreconditionError>,
): HistoryErrorResponse {
	return {
		message: redactAbsolutePaths(error.message),
		status:
			error instanceof UsageError
				? HTTP_STATUS_BAD_REQUEST
				: HTTP_STATUS_NOT_FOUND,
	};
}

export { commandRefusal, historyError };
export type { HistoryErrorResponse };
