import { loadRunManifest } from "./manifest";
import type { NewRunEvent, RunEventStore } from "./run-events";
import { isTerminalRunEventKind } from "./run-events";
import { benchmarkRunPaths } from "./run-layout";
import { liveRunLiveness } from "./run-liveness";

interface ReconciliationDependencies {
	readonly runsDirectory: string;
	readonly artifactExists: (path: string) => Promise<boolean>;
	readonly loadManifest: (
		path: string,
	) => Promise<{ readonly sourceRoot: string } | undefined>;
	readonly readMarker: (
		sourceRoot: string,
	) => Promise<{ readonly pid: number } | undefined>;
	readonly isAlive: (pid: number) => boolean;
	readonly reportError: (message: string) => void;
}

/**
 * A run whose latest event is already terminal, or whose artifact already
 * landed on disk, needs nothing done: the first is a run this pass already
 * reconciled (or one that finished normally without a stale event), the
 * second is a run that finished normally before this pass ran. A missing
 * manifest or claim marker is "nothing to reconcile", not an error: the
 * crash may have preceded the manifest write, or the run's end may already
 * have removed its checkout, as a pause does without a terminal event.
 */
async function reconcileInterruptedRuns(
	store: RunEventStore,
	dependencies: ReconciliationDependencies,
): Promise<readonly string[]> {
	const reconciled: string[] = [];

	await Array.fromAsync(store.runIds(), async (runId) => {
		try {
			const event = await interruptionEvent(store, dependencies, runId);
			if (event === undefined) {
				return;
			}

			store.append(event);
			reconciled.push(runId);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			dependencies.reportError(`Failed to reconcile run ${runId}: ${message}`);
		}
	});

	return reconciled;
}

async function interruptionEvent(
	store: RunEventStore,
	dependencies: ReconciliationDependencies,
	runId: string,
): Promise<NewRunEvent | undefined> {
	const latest = store.latestEvent(runId);
	if (latest === undefined || isTerminalRunEventKind(latest.kind)) {
		return undefined;
	}

	const paths = benchmarkRunPaths(dependencies.runsDirectory, runId);
	if (!(await hasDeadClaim(paths, dependencies))) {
		return undefined;
	}

	return {
		elapsedMs: latest.elapsedMs,
		kind: "run-interrupted",
		runId,
		runSpentUsd: latest.runSpentUsd,
		runTokens: latest.runTokens,
		spentUsd: latest.spentUsd,
		stage: latest.stage,
	};
}
async function hasDeadClaim(
	paths: ReturnType<typeof benchmarkRunPaths>,
	dependencies: ReconciliationDependencies,
): Promise<boolean> {
	if (await dependencies.artifactExists(paths.artifactFile)) {
		return false;
	}

	const manifest = await dependencies.loadManifest(paths.manifestFile);
	if (manifest === undefined) {
		return false;
	}

	const marker = await dependencies.readMarker(manifest.sourceRoot);
	if (marker === undefined || dependencies.isAlive(marker.pid)) {
		return false;
	}

	return true;
}

/**
 * The real collaborators `reconcileInterruptedRuns` needs against the
 * filesystem and the OS: `loadRunManifest` throws on a missing file, where
 * this pass wants "nothing to reconcile", so the existence check comes
 * first. The marker read and the pid probe are the same two this codebase
 * asks the opposite question of when it decides a run is in flight, so both
 * come from `run-liveness`.
 */
function liveReconciliationDependencies(
	runsDirectory: string,
): ReconciliationDependencies {
	return {
		artifactExists: async (path) => await Bun.file(path).exists(),
		loadManifest: async (
			path,
		): ReturnType<ReconciliationDependencies["loadManifest"]> => {
			if (!(await Bun.file(path).exists())) {
				return undefined;
			}

			return await loadRunManifest(path);
		},
		runsDirectory,
		...liveRunLiveness(),
		reportError: (message) => {
			process.stderr.write(`${message}\n`);
		},
	};
}

export { reconcileInterruptedRuns, liveReconciliationDependencies };
export type { ReconciliationDependencies };
