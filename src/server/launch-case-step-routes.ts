import { Hono } from "hono";

import { HTTP_STATUS_BAD_REQUEST, HTTP_STATUS_OK } from "#server/http-status";
import type {
	LaunchContext,
	LaunchDependencies,
} from "#server/launches-contract";
import { parseStepEditRequest } from "#server/launches-step-edit-request-schema";
import {
	PipelineCaseRefusalError,
	declaredSteps,
	editDeclaredSteps,
} from "#server/pipeline-steps";
import routes from "#server/route-factory";

function readCaseStepsHandler(dependencies: LaunchDependencies) {
	return async (context: LaunchContext<"/api/cases/:id/steps">) => {
		try {
			return context.json(
				await declaredSteps(dependencies.casesRoot, context.req.param("id")),
				HTTP_STATUS_OK,
			);
		} catch (error) {
			if (!(error instanceof PipelineCaseRefusalError)) {
				throw error;
			}

			return context.json({ error: error.message }, error.status);
		}
	};
}

function writeCaseStepsHandler(dependencies: LaunchDependencies) {
	return async (context: LaunchContext<"/api/cases/:id/steps">) => {
		const parsed = await parseStepEditRequest(context.req);
		if (!parsed.success) {
			return context.json({ error: parsed.error }, HTTP_STATUS_BAD_REQUEST);
		}

		try {
			return context.json(
				await editDeclaredSteps(
					dependencies.casesRoot,
					context.req.param("id"),
					parsed.data.stages,
				),
				HTTP_STATUS_OK,
			);
		} catch (error) {
			if (!(error instanceof PipelineCaseRefusalError)) {
				throw error;
			}

			return context.json({ error: error.message }, error.status);
		}
	};
}

const caseStepsApi = routes((dependencies: LaunchDependencies) =>
	new Hono()
		.get("/api/cases/:id/steps", readCaseStepsHandler(dependencies))
		.put("/api/cases/:id/steps", writeCaseStepsHandler(dependencies)),
);

export { caseStepsApi as default };
