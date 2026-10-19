import { pipelinesApi } from "#server/launch-settings-routes";
import taskBundleReadApi from "#server/launch-task-bundle-read-routes";
import taskBundleWriteApi from "#server/launch-task-bundle-write-routes";
import type { LaunchDependencies } from "#server/launches-contract";
import routes from "#server/route-factory";

const taskBundlesApi = routes((dependencies: LaunchDependencies) =>
	taskBundleReadApi(dependencies)
		.route("/", taskBundleWriteApi(dependencies))
		.route("/", pipelinesApi(dependencies)),
);

export { taskBundlesApi as default };
