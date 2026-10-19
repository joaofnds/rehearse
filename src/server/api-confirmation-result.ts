import { Hono } from "hono";

import { UsageError } from "#cli/commands";
import { parseRecordId } from "#cli/record-id";
import { commandRefusal } from "#server/api-refusal";
import confirmationResult from "#server/api-saved-confirmation";
import type { ApiContext, ApiDependencies } from "#server/api-source";
import routes from "#server/route-factory";

function confirmationResultHandler(dependencies: ApiDependencies) {
	return async (
		context: ApiContext<"/api/groups/:groupId/reps/:repId/attempt/result">,
	) => {
		try {
			const id = parseRecordId(
				`rep:session:${context.req.param("groupId")}/${context.req.param("repId")}`,
			);
			if (id.kind !== "rep:session") {
				throw new UsageError("Invalid confirmation attempt identity");
			}

			const result = await confirmationResult(dependencies.runsDirectory, id);

			return result.found
				? context.json(result.record)
				: context.json({ error: result.message }, result.status);
		} catch (error) {
			if (error instanceof UsageError) {
				const refusal = commandRefusal(error);
				return context.json({ error: refusal.message }, refusal.status);
			}

			throw error;
		}
	};
}

const confirmationResultApi = routes((dependencies: ApiDependencies) =>
	new Hono().get(
		"/api/groups/:groupId/reps/:repId/attempt/result",
		confirmationResultHandler(dependencies),
	),
);

export { confirmationResultApi as default };
