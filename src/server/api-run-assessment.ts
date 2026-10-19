import { Hono } from "hono";

import { historyError } from "#server/api-refusal";
import type { ApiContext, ApiDependencies } from "#server/api-source";
import routes from "#server/route-factory";
import { readFinalAssessment } from "#server/run-investigation";
import { SessionHistoryReaderError } from "#server/session-history-reader";

function runFinalHandler(dependencies: ApiDependencies) {
	return async (context: ApiContext<"/api/runs/:run/final/assessment">) => {
		try {
			return context.json(
				await readFinalAssessment({
					run: context.req.param("run"),
					runsDirectory: dependencies.runsDirectory,
				}),
			);
		} catch (error) {
			if (!(error instanceof SessionHistoryReaderError)) {
				throw error;
			}

			const response = historyError(error);

			return context.json({ error: response.message }, response.status);
		}
	};
}

const runAssessmentApi = routes((dependencies: ApiDependencies) =>
	new Hono().get(
		"/api/runs/:run/final/assessment",
		runFinalHandler(dependencies),
	),
);

export { runAssessmentApi as default };
