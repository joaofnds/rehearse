import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import streamRunResponse from "#server/api-event-stream";
import type { ApiDependencies } from "#server/api-source";
import routes from "#server/route-factory";

const runEventsApi = routes((dependencies: ApiDependencies) =>
	new Hono().get("/api/runs/:run/events", (context) => {
		const runId = context.req.param("run");

		return streamSSE(
			context,
			async (stream) => {
				await streamRunResponse({
					runId,
					runsDirectory: dependencies.runsDirectory,
					stream,
				});
			},
			/**
			 * A disconnect while the store opens can reject before its try/finally
			 * starts. Hono calls this after the client has gone, so there is no
			 * consumer to report that rejection to and no opened store to close.
			 */
			async () => {
				await Promise.resolve();
			},
		);
	}),
);

export { runEventsApi as default };
