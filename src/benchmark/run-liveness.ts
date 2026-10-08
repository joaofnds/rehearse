import { loadRunManifest } from "./manifest";
import type { RunEventStore } from "./run-events";
import { readRunMarker } from "./target";

/**
 * What a target's claim marker says about who holds it. A marker written by
 * a control checkout from before claims named their run carries no `run`.
 */
export interface TargetClaim {
	readonly pid: number;
	readonly run?: string | undefined;
	readonly startedAt: string;
}

/**
 * The run a liveness question is about, with the moment it recorded its
 * first event, or undefined when it has recorded none yet.
 */
export interface ClaimingRun {
	readonly run: string;
	readonly firstEventAt: string | undefined;
}

export function claimingRun(
	runEvents: RunEventStore,
	run: string,
): ClaimingRun {
	return { run, firstEventAt: runEvents.eventsSince(run, 0)[0]?.recordedAt };
}

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
	readonly readMarker: (sourceRoot: string) => Promise<TargetClaim | undefined>;
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
 * Whether the target this run claimed is still held by this run's own live
 * process. The pid is what keeps the badge honest: reconciliation runs only at
 * server startup, so without this probe a run killed while the server stayed
 * up would read as RUNNING forever. The claim must also be the run's own,
 * because an operator who deletes a crashed run's marker lets a later run
 * claim the same target, and that run's live pid says nothing about this one.
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
	claiming: ClaimingRun,
): Promise<boolean> {
	const marker = await targetMarker(manifestFile, liveness, claiming);

	return marker !== undefined && liveness.isAlive(marker.pid);
}

/**
 * This run's own claim on the target it names, or undefined when the run has
 * no manifest, its target cannot be asked, for the reasons `claimsLiveTarget`
 * gives, or the target is claimed by another run.
 */
export async function targetMarker(
	manifestFile: string,
	liveness: RunLiveness,
	claiming: ClaimingRun,
): Promise<TargetClaim | undefined> {
	if (!(await Bun.file(manifestFile).exists())) {
		return undefined;
	}

	const manifest = await loadRunManifest(manifestFile);
	const marker = await liveness
		.readMarker(manifest.sourceRoot)
		.catch(() => undefined);

	return marker !== undefined && isOwnClaim(marker, claiming)
		? marker
		: undefined;
}

/**
 * A marker with no run name came from an older control checkout. A run claims
 * its target before it records any event, and a second claim is refused until
 * the first marker is deleted, so an unnamed marker written no later than the
 * run's first event can only be that run's own. A run that has recorded no
 * event yet cannot be told from a crashed one by an unnamed marker, so it
 * claims nothing.
 */
function isOwnClaim(marker: TargetClaim, claiming: ClaimingRun): boolean {
	if (marker.run !== undefined) {
		return marker.run === claiming.run;
	}

	return (
		claiming.firstEventAt !== undefined &&
		Date.parse(marker.startedAt) <= Date.parse(claiming.firstEventAt)
	);
}
