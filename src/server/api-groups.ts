import confirmationHistoryApi from "#server/api-confirmation-history";
import confirmationResultApi from "#server/api-confirmation-result";
import groupReadsApi from "#server/api-group-reads";
import groupResultsApi from "#server/api-group-results";
import type { ApiDependencies } from "#server/api-source";
import routes from "#server/route-factory";

const groupsApi = routes((dependencies: ApiDependencies) =>
	confirmationHistoryApi(dependencies)
		.route("/", groupResultsApi(dependencies))
		.route("/", confirmationResultApi(dependencies))
		.route("/", groupReadsApi(dependencies)),
);

export { groupsApi as default };
