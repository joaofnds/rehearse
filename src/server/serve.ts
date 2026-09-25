#!/usr/bin/env bun
import { join } from "node:path";
import { CONTROL_DIR, recordsDirectory } from "#benchmark/config";
import { assertPinnedBunVersion } from "#benchmark/bun-pin";
import { liveCorpusSource } from "#benchmark/corpus-file";
import { runEventsDatabaseFile } from "#benchmark/run-layout";
import { openRunEventStore } from "#benchmark/run-events";
import { liveRunLiveness } from "#benchmark/run-liveness";
import {
	liveReconciliationDependencies,
	reconcileInterruptedRuns,
} from "#benchmark/run-reconciliation";
import { createAppServer } from "./app";

const DEFAULT_PORT = 4173;

export function startLocalServer(
	port: number,
	fetch: (request: Request) => Response | Promise<Response>,
): Bun.Server<undefined> {
	return Bun.serve({ hostname: "127.0.0.1", port, fetch });
}

/**
 * Runs once at startup and completes before the server accepts traffic: a
 * crash leaves a run's event stream stuck at a non-terminal event, and a
 * fresh process boot is the meaningful moment to ask whether the pid that
 * was running it is still alive. Awaiting it here, rather than firing it in
 * the background, keeps a client from reading a run as "running" in the
 * window between the port opening and reconciliation finishing. A run
 * genuinely still in flight when only the server restarts is left alone
 * (its pid is alive), so this cannot mistake a healthy run for a crashed
 * one.
 */
async function reconcileOnStartup(runsDirectory: string): Promise<void> {
	const store = await openRunEventStore(runEventsDatabaseFile(runsDirectory));
	try {
		await reconcileInterruptedRuns(
			store,
			liveReconciliationDependencies(runsDirectory),
		);
	} finally {
		store.close();
	}
}

async function main(): Promise<void> {
	assertPinnedBunVersion();

	const runsDirectory = recordsDirectory();
	await reconcileOnStartup(runsDirectory);

	const app = createAppServer({
		runsDirectory,
		corpusSource: liveCorpusSource(),
		liveness: liveRunLiveness(),
		clientDistDirectory: join(CONTROL_DIR, "client", "dist"),
	});

	const port = Number(Bun.env["PORT"] ?? DEFAULT_PORT);
	startLocalServer(port, app.fetch);
	console.log(`rehearse serving on http://localhost:${String(port)}`);
}

if (import.meta.main) {
	await main();
}
