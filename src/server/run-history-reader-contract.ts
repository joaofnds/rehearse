import type { LaunchRecord } from "#benchmark/launch-record";
import type { RunEventStore } from "#benchmark/run-events";
import type { StageAttemptId } from "#benchmark/run-layout";
import type { RunLiveness } from "#benchmark/run-liveness";
import type { AttemptPosition } from "#server/checkpoint-attempts";

interface RunLivenessContext {
	readonly liveness: RunLiveness;
	readonly runEvents: RunEventStore;
}

interface RunRowIdentity {
	readonly runsDirectory: string;
	readonly run: string;
	readonly shortId: string | undefined;
}

interface RunRowLiveness {
	readonly runEvents: RunEventStore;
	readonly liveness: RunLiveness;
	readonly launchByPid: ReadonlyMap<number, LaunchRecord>;
}

interface ReplayRowIdentity {
	readonly runsDirectory: string;
	readonly attempt: StageAttemptId;
	readonly shortId: string | undefined;
}

interface ReplayRowIndexes {
	readonly shortIds: ReadonlyMap<string, string>;
	readonly attempts: ReadonlyMap<string, AttemptPosition>;
}

export type {
	RunLivenessContext,
	RunRowIdentity,
	RunRowLiveness,
	ReplayRowIdentity,
	ReplayRowIndexes,
};
