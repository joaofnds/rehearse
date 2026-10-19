import { Hono } from "hono";

import { committedRateCatalog } from "#benchmark/rate-catalog";
import { historyError } from "#server/api-refusal";
import redactedSeries from "#server/api-request-series";
import type { ApiContext, ApiDependencies } from "#server/api-source";
import { HTTP_STATUS_NOT_FOUND } from "#server/http-status";
import routes from "#server/route-factory";
import {
	SessionHistoryReaderError,
	readSessionAttemptAgentDetail,
	readSessionAttemptAgents,
	readSessionAttemptHistory,
	readSessionAttemptHistoryDetail,
	readSessionAttemptRequestSeries,
} from "#server/session-history-reader";

function sessionRequestsHandler(dependencies: ApiDependencies) {
	return async (
		context: ApiContext<"/api/attempts/session/:caseId/:uuid/history/requests">,
	) => {
		try {
			const series = await readSessionAttemptRequestSeries(
				{
					caseId: context.req.param("caseId"),
					runsDirectory: dependencies.runsDirectory,
					uuid: context.req.param("uuid"),
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

function sessionAgentsHandler(dependencies: ApiDependencies) {
	return async (
		context: ApiContext<"/api/attempts/session/:caseId/:uuid/history/agents">,
	) => {
		try {
			return context.json(
				await readSessionAttemptAgents(
					{
						caseId: context.req.param("caseId"),
						runsDirectory: dependencies.runsDirectory,
						uuid: context.req.param("uuid"),
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

function sessionAgentDetailHandler(dependencies: ApiDependencies) {
	return async (
		context: ApiContext<"/api/attempts/session/:caseId/:uuid/history/agents/:agentId/:eventId">,
	) => {
		try {
			const detail = await readSessionAttemptAgentDetail(
				{
					caseId: context.req.param("caseId"),
					runsDirectory: dependencies.runsDirectory,
					uuid: context.req.param("uuid"),
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

function sessionHistoryDetailHandler(dependencies: ApiDependencies) {
	return async (
		context: ApiContext<"/api/attempts/session/:caseId/:uuid/history/:eventId">,
	) => {
		try {
			const detail = await readSessionAttemptHistoryDetail(
				{
					caseId: context.req.param("caseId"),
					runsDirectory: dependencies.runsDirectory,
					uuid: context.req.param("uuid"),
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

function sessionHistoryHandler(dependencies: ApiDependencies) {
	return async (
		context: ApiContext<"/api/attempts/session/:caseId/:uuid/history">,
	) => {
		try {
			return context.json(
				await readSessionAttemptHistory({
					caseId: context.req.param("caseId"),
					runsDirectory: dependencies.runsDirectory,
					uuid: context.req.param("uuid"),
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

const sessionHistoryApi = routes((dependencies: ApiDependencies) =>
	new Hono()
		.get(
			"/api/attempts/session/:caseId/:uuid/history/requests",
			sessionRequestsHandler(dependencies),
		)
		.get(
			"/api/attempts/session/:caseId/:uuid/history/agents",
			sessionAgentsHandler(dependencies),
		)
		.get(
			"/api/attempts/session/:caseId/:uuid/history/agents/:agentId/:eventId",
			sessionAgentDetailHandler(dependencies),
		)
		.get(
			"/api/attempts/session/:caseId/:uuid/history/:eventId",
			sessionHistoryDetailHandler(dependencies),
		)
		.get(
			"/api/attempts/session/:caseId/:uuid/history",
			sessionHistoryHandler(dependencies),
		),
);

export { sessionHistoryApi as default };
