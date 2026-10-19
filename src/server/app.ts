import { Hono } from "hono";
import { serveStatic } from "hono/bun";

import {
	RecordParseCache,
	withRecordParseCache,
} from "#benchmark/record-parse-cache";

import type { ApiDependencies } from "./api";
import createApiApp from "./api";
import createCalibrationApp from "./calibration";
import createConfirmationArchiveApp from "./confirmation-archives";
import type { LaunchDependencies } from "./launches";
import createLaunchApp from "./launches";
import requestGuard from "./request-guard";

interface AppServerDependencies extends ApiDependencies, LaunchDependencies {
	readonly clientDistDirectory: string;
	readonly port: number;
	readonly recordParseCache?: Readonly<Pick<RecordParseCache, "parse">>;
}

/**
 * The whole stack behind one Hono instance, every route behind the request
 * guard: the read API, the launch routes and the calibration routes under `/api`, the built client's
 * static assets, and an index.html fallback for every other
 * path read with GET so the client-side router owns its own routes. A write
 * to a path no route declares answers 404 rather than the client page.
 */
function createAppServer(dependencies: AppServerDependencies): Hono {
	const app = new Hono();
	const records = dependencies.recordParseCache ?? new RecordParseCache();

	app.use("*", requestGuard(dependencies.port));
	app.use("*", async (_context, next) => {
		await withRecordParseCache(records, next);
	});
	app
		.route("/", createApiApp(dependencies))
		.route("/", createLaunchApp(dependencies))
		.route("/", createCalibrationApp(dependencies))
		.route("/", createConfirmationArchiveApp(dependencies));
	app.get(
		"*",
		serveStatic({
			rewriteRequestPath: (path) => (path === "/" ? "/index.html" : path),
			root: dependencies.clientDistDirectory,
		}),
	);
	app.get(
		"*",
		serveStatic({
			path: "index.html",
			root: dependencies.clientDistDirectory,
		}),
	);

	return app;
}

export { createAppServer as default };
export type { AppServerDependencies };
