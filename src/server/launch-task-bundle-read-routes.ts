import { Hono } from "hono";

import { HTTP_STATUS_BAD_REQUEST, HTTP_STATUS_OK } from "#server/http-status";
import { parseBundlePreviewRequest } from "#server/launch-bundle-requests";
import type {
	LaunchContext,
	LaunchDependencies,
} from "#server/launches-contract";
import { PipelineCaseRefusalError } from "#server/pipeline-steps";
import routes from "#server/route-factory";
import exportTaskBundle from "#server/task-bundle-export-task-bundle";
import previewTaskBundle from "#server/task-bundle-preview-task-bundle";

function exportCaseBundleHandler(dependencies: LaunchDependencies) {
	return async (context: LaunchContext<"/api/cases/:id/bundle">) => {
		const caseId = context.req.param("id");
		try {
			return context.json(
				await exportTaskBundle(dependencies.casesRoot, caseId),
				HTTP_STATUS_OK,
				{
					"Content-Disposition": `attachment; filename="${caseId}.task.json"`,
				},
			);
		} catch (error) {
			if (!(error instanceof PipelineCaseRefusalError)) {
				throw error;
			}

			return context.json({ error: error.message }, error.status);
		}
	};
}

function previewCaseBundleHandler() {
	return async (context: LaunchContext<"/api/task-bundles/preview">) => {
		const parsed = await parseBundlePreviewRequest(context.req);
		if (!parsed.success) {
			return context.json({ error: parsed.error }, HTTP_STATUS_BAD_REQUEST);
		}

		return context.json(previewTaskBundle(parsed.data.bundle), HTTP_STATUS_OK);
	};
}

const taskBundleReadApi = routes((dependencies: LaunchDependencies) =>
	new Hono()
		.get("/api/cases/:id/bundle", exportCaseBundleHandler(dependencies))
		.post("/api/task-bundles/preview", previewCaseBundleHandler()),
);

export { taskBundleReadApi as default };
