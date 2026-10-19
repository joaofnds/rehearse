import { Hono } from "hono";

import {
	HTTP_STATUS_BAD_REQUEST,
	HTTP_STATUS_CREATED,
} from "#server/http-status";
import { parseTaskImportRequest } from "#server/launch-bundle-requests";
import type {
	LaunchContext,
	LaunchDependencies,
} from "#server/launches-contract";
import { parsePipelineCaseRequest } from "#server/launches-pipeline-case-request-schema";
import { PipelineCaseRefusalError } from "#server/pipeline-steps";
import routes from "#server/route-factory";
import { declarePipelineCase, importTaskBundle } from "#server/task-bundle";

function importCaseBundleHandler(dependencies: LaunchDependencies) {
	return async (context: LaunchContext<"/api/cases/import">) => {
		const parsed = await parseTaskImportRequest(context.req);
		if (!parsed.success) {
			return context.json({ error: parsed.error }, HTTP_STATUS_BAD_REQUEST);
		}

		try {
			return context.json(
				await importTaskBundle(dependencies.casesRoot, parsed.data),
				HTTP_STATUS_CREATED,
			);
		} catch (error) {
			if (!(error instanceof PipelineCaseRefusalError)) {
				throw error;
			}

			return context.json({ error: error.message }, error.status);
		}
	};
}

function declarePipelineCaseHandler(dependencies: LaunchDependencies) {
	return async (context: LaunchContext<"/api/cases/pipeline">) => {
		const parsed = await parsePipelineCaseRequest(context.req);
		if (!parsed.success) {
			return context.json({ error: parsed.error }, HTTP_STATUS_BAD_REQUEST);
		}

		try {
			return context.json(
				await declarePipelineCase(dependencies.casesRoot, parsed.data),
				HTTP_STATUS_CREATED,
			);
		} catch (error) {
			if (!(error instanceof PipelineCaseRefusalError)) {
				throw error;
			}

			return context.json({ error: error.message }, error.status);
		}
	};
}

const taskBundleWriteApi = routes((dependencies: LaunchDependencies) =>
	new Hono()
		.post("/api/cases/import", importCaseBundleHandler(dependencies))
		.post("/api/cases/pipeline", declarePipelineCaseHandler(dependencies)),
);

export { taskBundleWriteApi as default };
