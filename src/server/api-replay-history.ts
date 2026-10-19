import { Hono } from "hono";

import { historyError } from "#server/api-refusal";
import type { ApiContext, ApiDependencies } from "#server/api-source";
import routes from "#server/route-factory";
import {
	SessionHistoryReaderError,
	readReplayHistory,
} from "#server/session-history-reader";

function replayHistoryHandler(dependencies: ApiDependencies) {
	return async (
		context: ApiContext<"/api/replays/:lineage/:timestamp/history">,
	) => {
		try {
			return context.json(
				await readReplayHistory({
					lineage: context.req.param("lineage"),
					runsDirectory: dependencies.runsDirectory,
					timestamp: context.req.param("timestamp"),
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

const replayHistoryApi = routes((dependencies: ApiDependencies) =>
	new Hono().get(
		"/api/replays/:lineage/:timestamp/history",
		replayHistoryHandler(dependencies),
	),
);

export { replayHistoryApi as default };
