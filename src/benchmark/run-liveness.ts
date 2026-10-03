import { loadRunManifest } from "./manifest";
import { readRunMarker } from "./target";

/**
 * Whether the process that claimed a target is still running. Reconciliation
 * asks the opposite question of the same two collaborators
 * (`run-reconciliation.ts`), acting when a pid is dead; a run-history row
 * asserts the positive, that this run is executing right now. The two readers
 * also disagree about a missing marker: reconciliation reads it as "nothing to
 * reconcile" and leaves the run alone, while a run with no marker is simply not
 * running, because a restored target has no claim on it.
 */
export interface RunLiveness {
	readonly readMarker: (
		sourceRoot: string,
	) => Promise<{ readonly pid: number } | undefined>;
	readonly isAlive: (pid: number) => boolean;
}

/**
 * `process.kill(pid, 0)` throws for a dead pid rather than returning false,
 * per Node's documented signal-0 liveness probe.
 */
export function liveRunLiveness(): RunLiveness {
	return {
		readMarker: readRunMarker,
		isAlive: (pid) => {
			try {
				process.kill(pid, 0);

				return true;
			} catch {
				return false;
			}
		},
	};
}

/**
 * Whether the target this run claimed is still held by a live process. The pid
 * is what keeps the badge honest: reconciliation runs only at server startup,
 * so without this probe a run killed while the server stayed up would read as
 * RUNNING forever.
 *
 * Every way of failing to reach an answer is "not running". Reading the marker
 * shells out to git in the target, so a target that was deleted or is no
 * longer a checkout throws rather than returning nothing. Letting that throw
 * escape would move the run from silently absent, which is where it sat before
 * this branch existed, to an unreadable entry blaming git on every page load,
 * for a run that is simply not executing.
 */
export async function claimsLiveTarget(
	manifestFile: string,
	liveness: RunLiveness,
): Promise<boolean> {
	const marker = await targetMarker(manifestFile, liveness);

	return marker !== undefined && liveness.isAlive(marker.pid);
}

/**
 * The marker on the target this run claimed, or undefined when the run has no
 * manifest or its target cannot be asked, for the reasons `claimsLiveTarget`
 * gives.
 */
export async function targetMarker(
	manifestFile: string,
	liveness: RunLiveness,
): Promise<{ readonly pid: number } | undefined> {
	if (!(await Bun.file(manifestFile).exists())) {
		return undefined;
	}

	const manifest = await loadRunManifest(manifestFile);

	return liveness.readMarker(manifest.sourceRoot).catch(() => undefined);
}
