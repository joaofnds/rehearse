import { Hono } from "hono";

import { UsageError } from "#cli/commands";
import { commandRefusal, historyError } from "#server/api-refusal";
import type { ApiContext, ApiDependencies } from "#server/api-source";
import { readGroupAttemptIndex } from "#server/attempt-evidence";
import readGroupFinalAssessment from "#server/group-final-assessment";
import routes from "#server/route-factory";
import { SessionHistoryReaderError } from "#server/session-history-reader";

function confirmationFinalHandler(dependencies: ApiDependencies) {
	return async (
		context: ApiContext<"/api/groups/:groupId/reps/:repId/attempt/final">,
	) => {
		try {
			return context.json(
				await readGroupFinalAssessment({
					groupId: context.req.param("groupId"),
					repId: context.req.param("repId"),
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

function groupAttemptsHandler(dependencies: ApiDependencies) {
	return async (context: ApiContext<"/api/groups/:groupId/attempts">) => {
		try {
			return context.json(
				await readGroupAttemptIndex({
					groupId: context.req.param("groupId"),
					runsDirectory: dependencies.runsDirectory,
				}),
			);
		} catch (error) {
			if (error instanceof SessionHistoryReaderError) {
				const response = historyError(error);
				return context.json({ error: response.message }, response.status);
			}

			if (error instanceof UsageError) {
				const response = commandRefusal(error);
				return context.json({ error: response.message }, response.status);
			}

			throw error;
		}
	};
}

const groupResultsApi = routes((dependencies: ApiDependencies) =>
	new Hono()
		.get(
			"/api/groups/:groupId/reps/:repId/attempt/final",
			confirmationFinalHandler(dependencies),
		)
		.get("/api/groups/:groupId/attempts", groupAttemptsHandler(dependencies)),
);

export { groupResultsApi as default };
