import { Hono } from "hono";

import { historyError } from "#server/api-refusal";
import type { ApiContext, ApiDependencies } from "#server/api-source";
import { HTTP_STATUS_NOT_FOUND } from "#server/http-status";
import routes from "#server/route-factory";
import {
	SessionHistoryReaderError,
	readStageCorpusReconciliation,
	readStageHistory,
	readStageHistoryDetail,
} from "#server/session-history-reader";

function stageCorpusHistoryHandler(dependencies: ApiDependencies) {
	return async (
		context: ApiContext<"/api/runs/:run/stages/:stage/history/corpus">,
	) => {
		try {
			return context.json(
				await readStageCorpusReconciliation({
					run: context.req.param("run"),
					runsDirectory: dependencies.runsDirectory,
					stage: context.req.param("stage"),
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

function stageHistoryDetailHandler(dependencies: ApiDependencies) {
	return async (
		context: ApiContext<"/api/runs/:run/stages/:stage/history/:eventId">,
	) => {
		try {
			const detail = await readStageHistoryDetail(
				{
					run: context.req.param("run"),
					runsDirectory: dependencies.runsDirectory,
					stage: context.req.param("stage"),
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

function stageHistoryHandler(dependencies: ApiDependencies) {
	return async (
		context: ApiContext<"/api/runs/:run/stages/:stage/history">,
	) => {
		try {
			return context.json(
				await readStageHistory({
					run: context.req.param("run"),
					runsDirectory: dependencies.runsDirectory,
					stage: context.req.param("stage"),
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

const stageHistoryApi = routes((dependencies: ApiDependencies) =>
	new Hono()
		.get(
			"/api/runs/:run/stages/:stage/history/corpus",
			stageCorpusHistoryHandler(dependencies),
		)
		.get(
			"/api/runs/:run/stages/:stage/history/:eventId",
			stageHistoryDetailHandler(dependencies),
		)
		.get(
			"/api/runs/:run/stages/:stage/history",
			stageHistoryHandler(dependencies),
		),
);

export { stageHistoryApi as default };
