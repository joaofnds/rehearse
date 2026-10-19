import { z } from "zod";

import { unhandled } from "#benchmark/contracts";
import { operatorStopRecord } from "#benchmark/operator-stop";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import type { RunLiveness } from "#benchmark/run-liveness";
import { recordPaused } from "#benchmark/run-pause";
import type { RecordedRunsFixture } from "#benchmark/run-records-test-support";
import {
	RUNNING_RUN,
	claimBy,
	nothingRunning,
} from "#benchmark/run-records-test-support";

import type { FinalOutcome, Reading } from "./run-record";

const RUN_OWNER_PID = 1;

const TERMINAL_EVENT_ELAPSED_MS = 9500;

const FINISHED_RUN = "2026-09-11T00-00-00.000Z";

const ASKED_RUN = "2026-09-12T00-00-00.000Z";

const liveRun: RunLiveness = {
	isAlive: () => true,
	readMarker: async () =>
		await Promise.resolve(claimBy(RUNNING_RUN, RUN_OWNER_PID)),
};

interface EndedRun {
	readonly ending: string;
	readonly write: (fixture: RecordedRunsFixture) => Promise<void>;
	readonly run: (fixture: RecordedRunsFixture) => string;
	readonly reason: string;
}

type StatusReading = Reading<{ readonly status: string }>;

/** The two readings that each name how the run ended. */
const runEndingSchema = z.object({
	finalOutcome: z.unknown(),
	status: z.unknown(),
});

/** What the run's own claim on its target answers when the record is read. */
type ClaimAnswer = "gone" | "live" | "unknown";

function claimLiveness(run: string, claim: ClaimAnswer): RunLiveness {
	switch (claim) {
		case "gone": {
			return nothingRunning;
		}
		case "live": {
			return {
				isAlive: () => true,
				readMarker: async () =>
					await Promise.resolve(claimBy(run, RUN_OWNER_PID)),
			};
		}
		case "unknown": {
			return {
				isAlive: () => false,
				readMarker: async () =>
					await Promise.reject(new Error("unreadable target")),
			};
		}
		default: {
			return unhandled(claim, "claim answer");
		}
	}
}

function listedAs(status: string): StatusReading {
	return { state: "available", status };
}

function unlisted(reason: string): StatusReading {
	return { reasons: [reason], state: "unavailable" };
}

interface RunEnding {
	readonly ending: string;
	readonly write: (fixture: RecordedRunsFixture) => Promise<string>;
	readonly claim: ClaimAnswer;
	readonly status: StatusReading;
	readonly finalOutcome: FinalOutcome;
}

async function recordPause(
	fixture: RecordedRunsFixture,
	run: string,
): Promise<void> {
	await recordPaused(
		benchmarkRunPaths(fixture.runsDirectory, run),
		"build",
		"2026-10-13T00:00:00.000Z",
	);
}

async function recordOperatorStop(
	fixture: RecordedRunsFixture,
	run: string,
): Promise<void> {
	await Bun.write(
		benchmarkRunPaths(fixture.runsDirectory, run).operatorStopFile,
		operatorStopRecord("SIGTERM"),
	);
}

export {
	RUN_OWNER_PID,
	FINISHED_RUN,
	ASKED_RUN,
	liveRun,
	runEndingSchema,
	claimLiveness,
	listedAs,
	unlisted,
	recordPause,
	recordOperatorStop,
	TERMINAL_EVENT_ELAPSED_MS,
};

export type { RunEnding, EndedRun };
