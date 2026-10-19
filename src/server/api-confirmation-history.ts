import { Hono } from "hono";

import { committedRateCatalog } from "#benchmark/rate-catalog";
import { historyError } from "#server/api-refusal";
import redactedSeries from "#server/api-request-series";
import type { ApiContext, ApiDependencies } from "#server/api-source";
import { HTTP_STATUS_NOT_FOUND } from "#server/http-status";
import routes from "#server/route-factory";
import {
	SessionHistoryReaderError,
	readConfirmationAttemptAgentDetail,
	readConfirmationAttemptAgents,
	readConfirmationAttemptHistory,
	readConfirmationAttemptHistoryDetail,
	readConfirmationAttemptRequestSeries,
} from "#server/session-history-reader";

function confirmationRequestsHandler(dependencies: ApiDependencies) {
	return async (
		context: ApiContext<"/api/groups/:groupId/reps/:repId/attempt/history/requests">,
	) => {
		try {
			const series = await readConfirmationAttemptRequestSeries(
				{
					groupId: context.req.param("groupId"),
					repId: context.req.param("repId"),
					runsDirectory: dependencies.runsDirectory,
				},
				committedRateCatalog,
			);
			return context.json(redactedSeries(series));
		} catch (error) {
			if (!(error instanceof SessionHistoryReaderError)) {
				throw error;
			}

			const response = historyError(error);

			return context.json({ error: response.message }, response.status);
		}
	};
}

function confirmationAgentsHandler(dependencies: ApiDependencies) {
	return async (
		context: ApiContext<"/api/groups/:groupId/reps/:repId/attempt/history/agents">,
	) => {
		try {
			return context.json(
				await readConfirmationAttemptAgents(
					{
						groupId: context.req.param("groupId"),
						repId: context.req.param("repId"),
						runsDirectory: dependencies.runsDirectory,
					},
					committedRateCatalog,
				),
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

function confirmationAgentDetailHandler(dependencies: ApiDependencies) {
	return async (
		context: ApiContext<"/api/groups/:groupId/reps/:repId/attempt/history/agents/:agentId/:eventId">,
	) => {
		try {
			const detail = await readConfirmationAttemptAgentDetail(
				{
					groupId: context.req.param("groupId"),
					repId: context.req.param("repId"),
					runsDirectory: dependencies.runsDirectory,
				},
				context.req.param("agentId"),
				context.req.param("eventId"),
			);
			if (detail === undefined) {
				return context.json(
					{ error: "No event at this locator" },
					HTTP_STATUS_NOT_FOUND,
				);
			}

			return context.json(detail);
		} catch (error) {
			if (!(error instanceof SessionHistoryReaderError)) {
				throw error;
			}

			const response = historyError(error);

			return context.json({ error: response.message }, response.status);
		}
	};
}

function confirmationHistoryDetailHandler(dependencies: ApiDependencies) {
	return async (
		context: ApiContext<"/api/groups/:groupId/reps/:repId/attempt/history/:eventId">,
	) => {
		try {
			const detail = await readConfirmationAttemptHistoryDetail(
				{
					groupId: context.req.param("groupId"),
					repId: context.req.param("repId"),
					runsDirectory: dependencies.runsDirectory,
				},
				context.req.param("eventId"),
			);
			if (detail === undefined) {
				return context.json(
					{ error: "No event at this locator" },
					HTTP_STATUS_NOT_FOUND,
				);
			}

			return context.json(detail);
		} catch (error) {
			if (!(error instanceof SessionHistoryReaderError)) {
				throw error;
			}

			const response = historyError(error);

			return context.json({ error: response.message }, response.status);
		}
	};
}

function confirmationHistoryHandler(dependencies: ApiDependencies) {
	return async (
		context: ApiContext<"/api/groups/:groupId/reps/:repId/attempt/history">,
	) => {
		try {
			return context.json(
				await readConfirmationAttemptHistory({
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

const confirmationHistoryApi = routes((dependencies: ApiDependencies) =>
	new Hono()
		.get(
			"/api/groups/:groupId/reps/:repId/attempt/history/requests",
			confirmationRequestsHandler(dependencies),
		)
		.get(
			"/api/groups/:groupId/reps/:repId/attempt/history/agents",
			confirmationAgentsHandler(dependencies),
		)
		.get(
			"/api/groups/:groupId/reps/:repId/attempt/history/agents/:agentId/:eventId",
			confirmationAgentDetailHandler(dependencies),
		)
		.get(
			"/api/groups/:groupId/reps/:repId/attempt/history/:eventId",
			confirmationHistoryDetailHandler(dependencies),
		)
		.get(
			"/api/groups/:groupId/reps/:repId/attempt/history",
			confirmationHistoryHandler(dependencies),
		),
);

export { confirmationHistoryApi as default };
