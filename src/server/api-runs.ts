import runAssessmentApi from "#server/api-run-assessment";
import runEventsApi from "#server/api-run-events";
import runListingApi from "#server/api-run-listing";
import runResultsApi from "#server/api-run-results";
import type { ApiDependencies } from "#server/api-source";
import stageHistoryApi from "#server/api-stage-history";
import stageResultsApi from "#server/api-stage-results";
import routes from "#server/route-factory";

const runsApi = routes((dependencies: ApiDependencies) =>
	runListingApi(dependencies)
		.route("/", stageHistoryApi(dependencies))
		.route("/", stageResultsApi(dependencies))
		.route("/", runAssessmentApi(dependencies))
		.route("/", runResultsApi(dependencies))
		.route("/", runEventsApi(dependencies)),
);

export { runsApi as default };
