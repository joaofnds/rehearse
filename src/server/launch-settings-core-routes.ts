import { Hono } from "hono";

import { storeSpendCeiling } from "#benchmark/settings";
import {
	HTTP_STATUS_BAD_REQUEST,
	HTTP_STATUS_CONFLICT,
	HTTP_STATUS_OK,
} from "#server/http-status";
import { LaunchRefusalError, asLaunchRefusal } from "#server/launch-refusal";
import { parseSpendCeilingRequest } from "#server/launch-settings-requests";
import type {
	LaunchContext,
	LaunchDependencies,
} from "#server/launches-contract";
import { settingsReading } from "#server/launches-settings-reading";
import { RecordsSizeError, recordsSize } from "#server/records-size";
import { redactAbsolutePaths } from "#server/redact-path";
import routes from "#server/route-factory";

function readSettingsHandler(dependencies: LaunchDependencies) {
	return async (context: LaunchContext<"/api/settings">) => {
		try {
			return context.json(await settingsReading(dependencies), HTTP_STATUS_OK);
		} catch (error) {
			if (!(error instanceof LaunchRefusalError)) {
				throw error;
			}

			return context.json({ error: error.message }, error.status);
		}
	};
}

function readRecordsSizeHandler(dependencies: LaunchDependencies) {
	return async (context: LaunchContext<"/api/settings/records">) => {
		try {
			return context.json(
				{ bytes: await recordsSize(dependencies.runsDirectory) },
				HTTP_STATUS_OK,
			);
		} catch (error) {
			if (!(error instanceof RecordsSizeError)) {
				throw error;
			}

			return context.json(
				{ error: redactAbsolutePaths(error.message) },
				HTTP_STATUS_CONFLICT,
			);
		}
	};
}

function storeSpendCeilingHandler(dependencies: LaunchDependencies) {
	return async (context: LaunchContext<"/api/settings/spend-ceiling">) => {
		const parsed = await parseSpendCeilingRequest(context.req);
		if (!parsed.success) {
			return context.json({ error: parsed.error }, HTTP_STATUS_BAD_REQUEST);
		}

		try {
			await asLaunchRefusal(async () => {
				await storeSpendCeiling(dependencies.runsDirectory, parsed.data.usd);
			});

			return context.json(await settingsReading(dependencies), HTTP_STATUS_OK);
		} catch (error) {
			if (!(error instanceof LaunchRefusalError)) {
				throw error;
			}

			return context.json({ error: error.message }, error.status);
		}
	};
}

const settingsCoreApi = routes((dependencies: LaunchDependencies) =>
	new Hono()
		.get("/api/settings", readSettingsHandler(dependencies))
		.get("/api/settings/records", readRecordsSizeHandler(dependencies))
		.put("/api/settings/spend-ceiling", storeSpendCeilingHandler(dependencies)),
);

export { settingsCoreApi as default };
