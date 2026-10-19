import { Hono } from "hono";
import type { TypedResponse } from "hono";

import {
	CorpusVersionError,
	corpusVersionLog,
	findCorpusVersion,
	readCorpusVersion,
	readCorpusVersionFile,
} from "#benchmark/corpus-version";
import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import { corpusSource } from "#server/api-source";
import type { ApiContext, ApiDependencies } from "#server/api-source";
import versionRefusal from "#server/api-version-refusal";
import {
	HTTP_STATUS_BAD_REQUEST,
	HTTP_STATUS_NOT_FOUND,
	HTTP_STATUS_OK,
} from "#server/http-status";
import routes from "#server/route-factory";

const ORDINAL_BASE = 1;

function corpusVersionsHandler(dependencies: ApiDependencies) {
	return async (context: ApiContext<"/api/corpus/versions">) => {
		const log = await corpusVersionLog(
			dependencies.runsDirectory,
			await corpusSource(dependencies),
		);

		return context.json({
			versions: log.map((digest, index) => ({
				digest,
				label: corpusVersionLabel(digest),
				position: index + ORDINAL_BASE,
			})),
		});
	};
}

function corpusVersionHandler(dependencies: ApiDependencies) {
	return async (context: ApiContext<"/api/corpus/versions/:version">) => {
		const found = await findCorpusVersion(
			dependencies.runsDirectory,
			context.req.param("version"),
		);
		if (found.kind !== "found") {
			const refusal = versionRefusal(found);

			return context.json(refusal.body, refusal.status);
		}

		return context.json({
			digest: found.digest,
			files: await readCorpusVersion(dependencies.runsDirectory, found.digest),
			label: corpusVersionLabel(found.digest),
		});
	};
}

function corpusVersionFileHandler(dependencies: ApiDependencies) {
	return async (context: ApiContext<"/api/corpus/versions/:version/file">) => {
		const found = await findCorpusVersion(
			dependencies.runsDirectory,
			context.req.param("version"),
		);
		if (found.kind !== "found") {
			const refusal = versionRefusal(found);

			return context.json(refusal.body, refusal.status);
		}

		const path = context.req.query("path");
		if (path === undefined) {
			return context.json(
				{ error: "Name the file with ?path=" },
				HTTP_STATUS_BAD_REQUEST,
			);
		}

		return await versionFileContent(context, {
			digest: found.digest,
			path,
			runsDirectory: dependencies.runsDirectory,
		});
	};
}

interface VersionFileRequest {
	readonly runsDirectory: string;
	readonly digest: string;
	readonly path: string;
}

async function versionFileContent(
	context: ApiContext<"/api/corpus/versions/:version/file">,
	request: VersionFileRequest,
): Promise<
	| (Response & TypedResponse<Uint8Array, typeof HTTP_STATUS_OK, "body">)
	| (Response &
			TypedResponse<{ error: string }, typeof HTTP_STATUS_NOT_FOUND, "json">)
> {
	try {
		const bytes = await readCorpusVersionFile(
			request.runsDirectory,
			request.digest,
			request.path,
		);
		return context.body(new Uint8Array(bytes), HTTP_STATUS_OK, {
			"content-type": "application/octet-stream",
		});
	} catch (error) {
		if (error instanceof CorpusVersionError) {
			return context.json({ error: error.message }, HTTP_STATUS_NOT_FOUND);
		}

		throw error;
	}
}

const corpusVersionsApi = routes((dependencies: ApiDependencies) =>
	new Hono()
		.get("/api/corpus/versions", corpusVersionsHandler(dependencies))
		.get("/api/corpus/versions/:version", corpusVersionHandler(dependencies))
		.get(
			"/api/corpus/versions/:version/file",
			corpusVersionFileHandler(dependencies),
		),
);

export { corpusVersionsApi as default };
