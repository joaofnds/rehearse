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
	return { run, firstEventAt: runEvents.firstEvent(run)?.recordedAt };
}

/**
 * Whether the process that claimed a target is still running. Reconciliation
 * asks the opposite question of the same two collaborators
 * (`run-reconciliation.ts`), acting when a pid is dead; a run-history row
 * asserts the positive, that this run is executing right now. The two readers
 * also disagree about a missing marker: reconciliation reads it as "nothing to
 * reconcile" and leaves the run alone, while a run with no marker is simply not
 * running, because a restored target has no claim on it. Reconciliation also
 * reads the pid alone, while a row asks whether the claim is the run's own, so
 * a crashed run whose target another run claimed is listed as interrupted but
 * never reconciled.
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
 * What a run's own claim on its target says about the run's process. `live`
 * is a claim of this run's held by a running pid. `gone` is every other answer
 * the target gave: no marker, another run's claim, or this run's claim with a
 * dead pid. `unknown` is a target that could not be asked, because the run has
 * no manifest naming it or reading the marker threw. Reading the marker shells
 * out to git in the target, so a target that was deleted or is no longer a
 * checkout throws rather than returning nothing.
 */
export type RunClaim = "live" | "gone" | "unknown";

type MarkerReading =
	| { readonly state: "unread" }
	| { readonly state: "read"; readonly marker: TargetClaim | undefined };

export async function runClaim(
	manifestFile: string,
	liveness: RunLiveness,
	claiming: ClaimingRun,
): Promise<RunClaim> {
	const reading = await ownMarker(manifestFile, liveness, claiming);
	if (reading.state === "unread") {
		return "unknown";
	}

	if (reading.marker !== undefined && liveness.isAlive(reading.marker.pid)) {
		return "live";
	}

	return "gone";
}

/**
 * Whether the target this run claimed is still held by this run's own live
 * process. The pid is what keeps the badge honest: reconciliation runs only at
 * server startup, so without this probe a run killed while the server stayed
 * up would read as RUNNING forever. The claim must also be the run's own,
 * because an operator who deletes a crashed run's marker lets a later run
 * claim the same target, and that run's live pid says nothing about this one.
 *
 * A target that could not be asked is "not running" here: letting the throw
 * escape would turn every page load into an unreadable entry blaming git for
 * a run that is simply not executing.
 */
export async function claimsLiveTarget(
	manifestFile: string,
	liveness: RunLiveness,
	claiming: ClaimingRun,
): Promise<boolean> {
	return (await runClaim(manifestFile, liveness, claiming)) === "live";
}

/**
 * This run's own claim on the target it names, or undefined when the target
 * cannot be asked, for the reasons `RunClaim` gives, or holds no claim of
 * this run's.
 */
export async function targetMarker(
	manifestFile: string,
	liveness: RunLiveness,
	claiming: ClaimingRun,
): Promise<TargetClaim | undefined> {
	const reading = await ownMarker(manifestFile, liveness, claiming);

	return reading.state === "read" ? reading.marker : undefined;
}

async function ownMarker(
	manifestFile: string,
	liveness: RunLiveness,
	claiming: ClaimingRun,
): Promise<MarkerReading> {
	if (!(await Bun.file(manifestFile).exists())) {
		return { state: "unread" };
	}

	const manifest = await loadRunManifest(manifestFile);
	let marker;
	try {
		marker = await liveness.readMarker(manifest.sourceRoot);
	} catch {
		return { state: "unread" };
	}

	return {
		state: "read",
		marker:
			marker !== undefined && isOwnClaim(marker, claiming) ? marker : undefined,
	};
}

/**
 * A marker with no run name came from an older control checkout. A run claims
 * its target before it records any event, and a second claim is refused until
 * the first marker is deleted, so an unnamed marker written no later than the
 * run's first event can only be that run's own. A run that has recorded no
 * event yet may be one that has just claimed, so an unnamed marker counts as
 * its own, which keeps such a run refused as in flight rather than analyzed.
 */
function isOwnClaim(marker: TargetClaim, claiming: ClaimingRun): boolean {
	if (marker.run !== undefined) {
		return marker.run === claiming.run;
	}

	return (
		claiming.firstEventAt === undefined ||
		Date.parse(marker.startedAt) <= Date.parse(claiming.firstEventAt)
	);
}
