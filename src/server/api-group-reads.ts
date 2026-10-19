import { Hono } from "hono";

import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { UsageError } from "#cli/commands";
import groupReading from "#server/api-group-reading";
import { commandRefusal } from "#server/api-refusal";
import type { ApiContext, ApiDependencies } from "#server/api-source";
import routes from "#server/route-factory";

function groupReadsHandler(dependencies: ApiDependencies) {
	return async (context: ApiContext<"/api/groups/:groupId/reads">) => {
		try {
			return context.json(
				await groupReading(dependencies, context.req.param("groupId")),
			);
		} catch (error) {
			if (
				error instanceof UsageError ||
				error instanceof RefusedPreconditionError
			) {
				const refusal = commandRefusal(error);
				return context.json({ error: refusal.message }, refusal.status);
			}

			throw error;
		}
	};
}

const groupReadsApi = routes((dependencies: ApiDependencies) =>
	new Hono().get("/api/groups/:groupId/reads", groupReadsHandler(dependencies)),
);

export { groupReadsApi as default };
