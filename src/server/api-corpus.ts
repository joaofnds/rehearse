import { Hono } from "hono";

import {
	UnlistedCorpusFileError,
	readListedCorpusFile,
} from "#benchmark/corpus-edit";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import corpusVersionsApi from "#server/api-corpus-versions";
import { corpusSource } from "#server/api-source";
import type { ApiContext, ApiDependencies } from "#server/api-source";
import { corpusReport, corpusSummary } from "#server/corpus-report";
import CORPUS_VERSION_HEADER from "#server/corpus-version-header";
import { HTTP_STATUS_BAD_REQUEST, HTTP_STATUS_OK } from "#server/http-status";
import type {
	HTTP_STATUS_CONFLICT,
	HTTP_STATUS_NOT_FOUND,
} from "#server/http-status";
import { redactAbsolutePaths } from "#server/redact-path";
import routes from "#server/route-factory";

function currentCorpusHandler(dependencies: ApiDependencies) {
	return async (context: ApiContext<"/api/corpus">) => {
		const report = await corpusReport(
			await corpusSource(dependencies),
			dependencies.runsDirectory,
		);

		return context.json(report);
	};
}

function corpusSummaryHandler(dependencies: ApiDependencies) {
	return async (context: ApiContext<"/api/corpus-summary">) =>
		context.json(await corpusSummary(await corpusSource(dependencies)));
}

function corpusFileHandler(dependencies: ApiDependencies) {
	return async (context: ApiContext<"/api/corpus/file">) => {
		const path = context.req.query("path");
		if (path === undefined) {
			return context.json(
				{ error: "Name the file with ?path=" },
				HTTP_STATUS_BAD_REQUEST,
			);
		}

		try {
			const opened = await readListedCorpusFile(
				await corpusSource(dependencies),
				path,
			);

			return context.body(new Uint8Array(opened.bytes), HTTP_STATUS_OK, {
				"content-type": "application/octet-stream",
				[CORPUS_VERSION_HEADER]: opened.version,
			});
		} catch (error) {
			if (
				!(
					error instanceof UnlistedCorpusFileError ||
					error instanceof RefusedPreconditionError
				)
			) {
				throw error;
			}

			const refusal = corpusFileRefusal(error);

			return context.json({ error: refusal.message }, refusal.status);
		}
	};
}

interface CorpusFileRefusal {
	readonly message: string;
	readonly status: typeof HTTP_STATUS_NOT_FOUND | typeof HTTP_STATUS_CONFLICT;
}

function corpusFileRefusal(
	error: Readonly<UnlistedCorpusFileError> | Readonly<RefusedPreconditionError>,
): CorpusFileRefusal {
	return error instanceof UnlistedCorpusFileError
		? { message: error.message, status: 404 }
		: { message: redactAbsolutePaths(error.message), status: 409 };
}

const corpusApi = routes((dependencies: ApiDependencies) =>
	new Hono()
		.get("/api/corpus", currentCorpusHandler(dependencies))
		.get("/api/corpus-summary", corpusSummaryHandler(dependencies))
		.get("/api/corpus/file", corpusFileHandler(dependencies))
		.route("/", corpusVersionsApi(dependencies)),
);

export { corpusApi as default };
