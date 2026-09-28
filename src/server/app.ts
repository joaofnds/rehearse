import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import type { ApiDependencies } from "./api";
import { createApiApp } from "./api";
import { loopbackHostGuard } from "./request-guard";

export interface AppServerDependencies extends ApiDependencies {
	readonly clientDistDirectory: string;
	readonly port: number;
}

/**
 * The whole stack behind one Hono instance: the read API under `/api`, the
 * built client's static assets, and an index.html fallback for every other
 * path so the client-side router owns its own routes.
 */
export function createAppServer(dependencies: AppServerDependencies): Hono {
	const app = new Hono();

	app.use("*", loopbackHostGuard(dependencies.port));
	app.route("/", createApiApp(dependencies));
	app.use(
		"*",
		serveStatic({
			root: dependencies.clientDistDirectory,
			rewriteRequestPath: (path) => (path === "/" ? "/index.html" : path),
		}),
	);
	app.use(
		"*",
		serveStatic({
			root: dependencies.clientDistDirectory,
			path: "index.html",
		}),
	);

	return app;
}
