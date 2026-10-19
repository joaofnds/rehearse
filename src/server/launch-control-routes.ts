import { Hono } from "hono";

import { HTTP_STATUS_ACCEPTED } from "#server/http-status";
import { LaunchRefusalError } from "#server/launch-refusal";
import stopRecordedLaunch from "#server/launch-stop-recorded";
import claimingProcess from "#server/launches-claiming-process";
import type {
	LaunchContext,
	LaunchDependencies,
} from "#server/launches-contract";
import pauseRun from "#server/launches-pause-run";
import routes from "#server/route-factory";

function stopLaunchHandler(dependencies: LaunchDependencies) {
	return async (context: LaunchContext<"/api/launches/:id/stop">) => {
		const record = await stopRecordedLaunch(
			context.req.param("id"),
			dependencies,
		);
		if (record instanceof LaunchRefusalError) {
			return context.json({ error: record.message }, record.status);
		}

		return context.json({ id: record.id }, HTTP_STATUS_ACCEPTED);
	};
}

function stopRunHandler(dependencies: LaunchDependencies) {
	return async (context: LaunchContext<"/api/runs/:run/stop">) => {
		const run = context.req.param("run");
		try {
			dependencies.launcher.stop(await claimingProcess(run, dependencies));
		} catch (error) {
			if (!(error instanceof LaunchRefusalError)) {
				throw error;
			}

			return context.json({ error: error.message }, error.status);
		}

		return context.json({ run }, HTTP_STATUS_ACCEPTED);
	};
}

function pauseRunHandler(dependencies: LaunchDependencies) {
	return async (context: LaunchContext<"/api/runs/:run/pause">) => {
		const run = context.req.param("run");
		try {
			await pauseRun(run, dependencies);
		} catch (error) {
			if (!(error instanceof LaunchRefusalError)) {
				throw error;
			}

			return context.json({ error: error.message }, error.status);
		}

		return context.json({ run }, HTTP_STATUS_ACCEPTED);
	};
}

const controlApi = routes((dependencies: LaunchDependencies) =>
	new Hono()
		.post("/api/launches/:id/stop", stopLaunchHandler(dependencies))
		.post("/api/runs/:run/stop", stopRunHandler(dependencies))
		.post("/api/runs/:run/pause", pauseRunHandler(dependencies)),
);

export { controlApi as default };
