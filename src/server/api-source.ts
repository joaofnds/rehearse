import type { Context, Env, HonoRequest } from "hono";

import type { CorpusRoot } from "#benchmark/corpus-file";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import type { RunLiveness } from "#benchmark/run-liveness";
import {
	HTTP_STATUS_CONFLICT,
	HTTP_STATUS_INTERNAL_SERVER_ERROR,
} from "#server/http-status";
import { redactAbsolutePaths } from "#server/redact-path";

/**
 * A corpus the reads cannot measure, a moved linked directory or an unreadable
 * settings file, is a conflict with what is on disk rather than a record that
 * is not there, so it stays apart from the refusals the routes answer 404.
 */
class CorpusUnavailableError extends Error {
	public override name = "CorpusUnavailableError";
}

async function corpusSource(
	dependencies: Readonly<ApiDependencies>,
): Promise<CorpusRoot> {
	try {
		return await dependencies.readCorpusSource();
	} catch (error) {
		if (!(error instanceof RefusedPreconditionError)) {
			throw error;
		}

		throw new CorpusUnavailableError(error.message);
	}
}

interface ApiDependencies {
	readonly runsDirectory: string;
	/** Where the provider writes each session's transcript. */
	readonly projectsDirectory: string;
	/**
	 * Resolved on every request, so linking or unlinking a corpus directory
	 * changes what the next read measures without a restart.
	 */
	readonly readCorpusSource: () => Promise<CorpusRoot>;
	readonly liveness: RunLiveness;
}

/** Request operations available to read-only JSON and byte endpoints. */
interface ApiContext<Path extends string> {
	readonly req: Readonly<
		Pick<HonoRequest<Path>, "param" | "query" | "queries">
	>;
	readonly json: Context<Env>["json"];
	readonly body: Context<Env>["body"];
}

/** Redact unanticipated failures after the route's own refusal policy runs. */
function apiError(
	caughtError: Readonly<Error>,
	context: Readonly<Pick<Context<Env>, "json">>,
): Response {
	const { message } = caughtError;
	const status =
		caughtError instanceof CorpusUnavailableError
			? HTTP_STATUS_CONFLICT
			: HTTP_STATUS_INTERNAL_SERVER_ERROR;

	return context.json({ error: redactAbsolutePaths(message) }, status);
}

export { apiError, corpusSource };
export type { ApiContext, ApiDependencies };
