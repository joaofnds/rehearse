#!/usr/bin/env bun
import { assertPinnedBunVersion } from "#benchmark/bun-pin";
import { recordsDirectory } from "#benchmark/config";
import serverConfigurationSchema from "#server/serve-configuration";
import serverDependencies from "#server/serve-dependencies";
import startupReadings from "#server/serve-startup";

import createAppServer from "./app";

function startLocalServer(
	port: number,
	fetch: (request: Request) => Response | Promise<Response>,
): Bun.Server<undefined> {
	return Bun.serve({ fetch, hostname: "127.0.0.1", port });
}

async function main(): Promise<void> {
	assertPinnedBunVersion();

	const { port } = serverConfigurationSchema.parse(Bun.env);
	const runsDirectory = recordsDirectory();

	const readings = await startupReadings(runsDirectory);

	const app = createAppServer(
		serverDependencies({ ...readings, port, runsDirectory }),
	);

	startLocalServer(port, app.fetch);

	process.stdout.write(
		`rehearse serving on http://localhost:${String(port)}\n`,
	);
}

if (import.meta.main) {
	await main();
}

export { startLocalServer as default };
