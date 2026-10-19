import { Hono } from "hono";

import { displayPath } from "#benchmark/config";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { UsageError } from "#cli/commands";
import { parseRecordId } from "#cli/record-id";
import { recordFileFor } from "#cli/show-command";
import { commandRefusal } from "#server/api-refusal";
import type { ApiContext, ApiDependencies } from "#server/api-source";
import { HTTP_STATUS_OK } from "#server/http-status";
import routes from "#server/route-factory";

function recordHandler(dependencies: ApiDependencies) {
	return async (context: ApiContext<"/api/records/:id">) => {
		try {
			const id = parseRecordId(context.req.param("id"));
			const file = await recordFileFor(id, dependencies.runsDirectory);
			if (!(await Bun.file(file).exists())) {
				throw new RefusedPreconditionError(
					`No record ${context.req.param("id")} at ${displayPath(file)}`,
				);
			}

			return context.body(await Bun.file(file).text(), HTTP_STATUS_OK, {
				"content-type": "application/json",
			});
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

const recordsApi = routes((dependencies: ApiDependencies) =>
	new Hono().get("/api/records/:id", recordHandler(dependencies)),
);

export { recordsApi as default };
