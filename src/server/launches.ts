import CorpusEditGate from "#server/corpus-edit-gate";
import caseRegistryApi from "#server/launch-case-registry-routes";
import caseStepsApi from "#server/launch-case-step-routes";
import corpusEditsApi from "#server/launch-corpus-edit-routes";
import { executionApi } from "#server/launch-execution-routes";
import { unexpectedLaunchError } from "#server/launch-refusal";
import { settingsApi } from "#server/launch-settings-routes";
import taskBundlesApi from "#server/launch-task-bundle-routes";
import type { LaunchDependencies } from "#server/launches-contract";
import routes from "#server/route-factory";

const createLaunchApp = routes((dependencies: LaunchDependencies) => {
	const corpusEditGate = new CorpusEditGate();
	const app = settingsApi(dependencies)
		.route("/", corpusEditsApi({ corpusEditGate, dependencies }))
		.route("/", caseRegistryApi(dependencies))
		.route("/", caseStepsApi(dependencies))
		.route("/", taskBundlesApi(dependencies))
		.route("/", executionApi({ corpusEditGate, dependencies }));
	app.onError(unexpectedLaunchError);

	return app;
});

export { createLaunchApp as default };
export type {
	Launcher,
	LaunchDependencies,
	LaunchRequest,
	LaunchRoutes,
} from "#server/launches-contract";
