import comparisonsApi from "#server/api-comparisons";
import corpusApi from "#server/api-corpus";
import evidenceApi from "#server/api-evidence";
import groupsApi from "#server/api-groups";
import recordsApi from "#server/api-records";
import replayHistoryApi from "#server/api-replay-history";
import runsApi from "#server/api-runs";
import sessionHistoryApi from "#server/api-session-history";
import { apiError } from "#server/api-source";
import type { ApiDependencies } from "#server/api-source";
import routes from "#server/route-factory";

/** Compose domain routers without losing Hono's inferred RPC response types. */
const createApiApp = routes((dependencies: ApiDependencies) => {
	const app = runsApi(dependencies)
		.route("/", corpusApi(dependencies))
		.route("/", comparisonsApi(dependencies))
		.route("/", sessionHistoryApi(dependencies))
		.route("/", groupsApi(dependencies))
		.route("/", replayHistoryApi(dependencies))
		.route("/", evidenceApi(dependencies))
		.route("/", recordsApi(dependencies));

	app.onError(apiError);

	return app;
});

type ApiRoutes = ReturnType<typeof createApiApp>;

export { createApiApp as default };
export type { ApiRoutes };
export type { ApiDependencies } from "#server/api-source";
