import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import type { ApiDependencies } from "./api";
import { createApiApp } from "./api";
import { createConfirmationArchiveApp } from "./confirmation-archives";
import { createCalibrationApp } from "./calibration";
import type { LaunchDependencies } from "./launches";
import { createLaunchApp } from "./launches";
import { requestGuard } from "./request-guard";
import {
	RecordParseCache,
	withRecordParseCache,
} from "#benchmark/record-parse-cache";

export interface AppServerDependencies
	extends ApiDependencies, LaunchDependencies {
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
export function createAppServer(dependencies: AppServerDependencies): Hono {
	const app = new Hono();
	const records = dependencies.recordParseCache ?? new RecordParseCache();

	app.use("*", requestGuard(dependencies.port));
	app.use("*", (_context, next) => withRecordParseCache(records, next));
	app.route("/", createApiApp(dependencies));
	app.route("/", createLaunchApp(dependencies));
	app.route("/", createCalibrationApp(dependencies));
	app.route("/", createConfirmationArchiveApp(dependencies));
	app.get(
		"*",
		serveStatic({
			root: dependencies.clientDistDirectory,
			rewriteRequestPath: (path) => (path === "/" ? "/index.html" : path),
		}),
	);
	app.get(
		"*",
		serveStatic({
			root: dependencies.clientDistDirectory,
			path: "index.html",
		}),
	);

	return app;
}
