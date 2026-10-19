import {
	RecordParseCache,
	withRecordParseCache,
} from "#benchmark/record-parse-cache";
import { openRunEventStore } from "#benchmark/run-events";
import { runEventsDatabaseFile } from "#benchmark/run-layout";
import { liveRunLiveness } from "#benchmark/run-liveness";
import type { RunLiveness } from "#benchmark/run-liveness";
import {
	liveReconciliationDependencies,
	reconcileInterruptedRuns,
} from "#benchmark/run-reconciliation";
import { runListing } from "#server/run-history";

interface ServerReadings {
	readonly liveness: RunLiveness;
	readonly recordParseCache: Readonly<Pick<RecordParseCache, "parse">>;
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

async function startupReadings(runsDirectory: string): Promise<ServerReadings> {
	await reconcileOnStartup(runsDirectory);

	const liveness = liveRunLiveness();
	const recordParseCache = new RecordParseCache();

	await withRecordParseCache(
		recordParseCache,
		async () => await runListing(runsDirectory, liveness),
	);

	return { liveness, recordParseCache };
}

export { startupReadings as default };
export type { ServerReadings };
