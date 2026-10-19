import { writeLaunchRecord } from "#benchmark/launch-record";
import type { RunLiveness } from "#benchmark/run-liveness";
import type { RecordedRunsFixture } from "#benchmark/run-records-test-support";
import { RUNNING_RUN, claimBy } from "#benchmark/run-records-test-support";

const LAUNCH_ID = "8a1c0000-0000-4000-8000-000000000001";

const LIVE_PID = 4242;

const LAUNCHED_AT = "2026-09-29T10:00:00.000Z";

/** The run claims its target after its launch was dated. */
const CLAIMED_AT = "2026-09-29T10:00:01.000Z";

function launchLiveness(markerPid?: number): RunLiveness {
	return {
		isAlive: (pid) => pid === LIVE_PID,
		readMarker: async () =>
			await Promise.resolve(
				markerPid === undefined
					? undefined
					: claimBy(RUNNING_RUN, markerPid, CLAIMED_AT),
			),
	};
}

interface LaunchedFixtureInput {
	readonly fixture: RecordedRunsFixture;
	readonly pid: number;
}

async function launched({ fixture, pid }: LaunchedFixtureInput): Promise<void> {
	await writeLaunchRecord(fixture.runsDirectory, {
		attempts: 3,
		caseId: "audit-log",
		id: LAUNCH_ID,
		kind: "case",
		launchedAt: LAUNCHED_AT,
		pid,
	});
}

export {
	LAUNCH_ID,
	LIVE_PID,
	LAUNCHED_AT,
	CLAIMED_AT,
	launchLiveness,
	launched,
};
