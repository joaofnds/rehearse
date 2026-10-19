import { Hono } from "hono";

import { corpusSource } from "#server/api-source";
import type { ApiContext, ApiDependencies } from "#server/api-source";
import routes from "#server/route-factory";
import {
	runHistoryReport,
	runListing,
	runStalenessReport,
} from "#server/run-history";

function runHistoryHandler(dependencies: ApiDependencies) {
	return async (context: ApiContext<"/api/runs">) => {
		const ids = context.req.queries("ids");
		const report = await runHistoryReport(
			{
				runsDirectory: dependencies.runsDirectory,
				source: await corpusSource(dependencies),
			},
			dependencies.liveness,
			ids === undefined
				? undefined
				: new Set(ids.flatMap((listed) => listed.split(","))),
		);

		return context.json(report);
	};
}

function runListingHandler(dependencies: ApiDependencies) {
	return async (context: ApiContext<"/api/run-listing">) => {
		const listing = await runListing(
			dependencies.runsDirectory,
			dependencies.liveness,
		);

		return context.json(listing);
	};
}

function runStalenessHandler(dependencies: ApiDependencies) {
	return async (context: ApiContext<"/api/run-staleness">) =>
		context.json(
			await runStalenessReport(
				dependencies.runsDirectory,
				await corpusSource(dependencies),
			),
		);
}

const runListingApi = routes((dependencies: ApiDependencies) =>
	new Hono()
		.get("/api/runs", runHistoryHandler(dependencies))
		.get("/api/run-listing", runListingHandler(dependencies))
		.get("/api/run-staleness", runStalenessHandler(dependencies)),
);

export { runListingApi as default };
