import { Hono } from "hono";

import corpusSettingsApi from "#server/launch-corpus-settings-routes";
import settingsCoreApi from "#server/launch-settings-core-routes";
import type {
	LaunchContext,
	LaunchDependencies,
} from "#server/launches-contract";
import { pipelineReport } from "#server/pipelines";
import routes from "#server/route-factory";

const settingsApi = routes((dependencies: LaunchDependencies) =>
	settingsCoreApi(dependencies).route("/", corpusSettingsApi(dependencies)),
);

function listPipelinesHandler(dependencies: LaunchDependencies) {
	return async (context: LaunchContext<"/api/pipelines">) =>
		context.json(
			await pipelineReport(dependencies.casesRoot, dependencies.runsDirectory),
		);
}

const pipelinesApi = routes((dependencies: LaunchDependencies) =>
	new Hono().get("/api/pipelines", listPipelinesHandler(dependencies)),
);

export { settingsApi, pipelinesApi };
