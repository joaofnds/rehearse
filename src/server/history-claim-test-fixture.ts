import { openRunEventStore } from "#benchmark/run-events";
import { runEventsDatabaseFile } from "#benchmark/run-layout";
import type { RunLiveness } from "#benchmark/run-liveness";
import { claimBy } from "#benchmark/run-records-test-support";

const RUN_OWNER_PID = 4242;

/**
 * The two answers the pid probe can give for a claim `run` holds, without a
 * process to spawn. A live marker names a pid this test never checks for
 * real: what the branch is being asked is whether it consults the probe at
 * all, and a Stub is the only way to ask that deterministically.
 */
function liveness(alive: boolean, run: string): RunLiveness {
	return {
		isAlive: () => alive,
		readMarker: async () => await Promise.resolve(claimBy(run, RUN_OWNER_PID)),
	};
}

function unnamedClaim(startedAt: string): RunLiveness {
	return {
		isAlive: () => true,
		readMarker: async () => await Promise.resolve({ pid: 4242, startedAt }),
	};
}

interface FirstEventShiftedByFixtureInput {
	readonly runsDirectory: string;
	readonly run: string;
	readonly ms: number;
}

async function firstEventShiftedBy({
	runsDirectory,
	run,
	ms,
}: FirstEventShiftedByFixtureInput): Promise<string> {
	const store = await openRunEventStore(runEventsDatabaseFile(runsDirectory));
	const recordedAt = store.firstEvent(run)?.recordedAt;
	store.close();
	if (recordedAt === undefined) {
		throw new Error(`run ${run} recorded no event`);
	}

	return new Date(Date.parse(recordedAt) + ms).toISOString();
}

export { liveness, unnamedClaim, firstEventShiftedBy };
