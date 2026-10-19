import { unhandled } from "./contracts";
import { operatorStopped } from "./operator-stop";
import type {
	NonTerminalRunEventKind,
	RunEvent,
	RunEventStore,
} from "./run-events";
import { isTerminalRunEventKind } from "./run-events";
import type { RunLocation } from "./run-layout";
import { benchmarkRunPaths } from "./run-layout";
import type { RunLiveness } from "./run-liveness";
import { claimingRun, runClaim } from "./run-liveness";
import { awaitingJudgeStage, stoppedStage } from "./run-outcome";
import { pausedStage } from "./run-pause";

const INITIAL_RUN_EVENT_CURSOR = 0;

/** An event of a kind that does not end a run's event stream. */
type NonTerminalRunEvent = RunEvent & {
	readonly kind: NonTerminalRunEventKind;
};

function isNonTerminal(event: RunEvent): event is NonTerminalRunEvent {
	return !isTerminalRunEventKind(event.kind);
}

/**
 * How a run ended, or that it has not, as its records say. Every reader that
 * names a run's ending maps this through an exhaustive switch, so an ending
 * added here is one each of them must handle.
 */
type RunEnding =
	| { readonly kind: "main-artifact" }
	| { readonly kind: "stopped"; readonly stage: string; readonly error: string }
	| { readonly kind: "paused"; readonly stage: string }
	| { readonly kind: "operator-stopped"; readonly stage: string | undefined }
	| { readonly kind: "interrupted"; readonly stage: string }
	| { readonly kind: "failed"; readonly stage: string | undefined }
	| { readonly kind: "running"; readonly latest: NonTerminalRunEvent }
	| { readonly kind: "unconfirmed"; readonly stage: string }
	| { readonly kind: "completed-without-artifact"; readonly stage: string }
	| { readonly kind: "awaiting-judgment"; readonly stage: string }
	| { readonly kind: "no-events" };

/**
 * The stage a failed run failed in. A failure caught outside any stage the
 * runner tracks records `run-failed` with no stage, so the last stage the run
 * started stands in, and a run that started none names no stage.
 */
function failedStage(
	runEvents: RunEventStore,
	run: string,
): string | undefined {
	return runEvents
		.eventsSince(run, INITIAL_RUN_EVENT_CURSOR)
		.map(({ stage }) => stage)
		.findLast((stage) => stage !== "");
}

interface RunEndingReading {
	readonly runsDirectory: string;
	readonly run: string;
	readonly paths: ReturnType<typeof benchmarkRunPaths>;
	readonly runEvents: RunEventStore;
	readonly liveness: RunLiveness;
}
async function runEnding(
	{ runsDirectory, run }: RunLocation,
	runEvents: RunEventStore,
	liveness: RunLiveness,
): Promise<RunEnding> {
	const reading: RunEndingReading = {
		liveness,
		paths: benchmarkRunPaths(runsDirectory, run),
		run,
		runEvents,
		runsDirectory,
	};
	if (await Bun.file(reading.paths.artifactFile).exists()) {
		return { kind: "main-artifact" };
	}

	const recorded = await recordedEnding(reading);
	if (recorded !== undefined) {
		return recorded;
	}

	const latest = runEvents.latestEvent(run);
	if (latest === undefined) {
		return await withoutEvents(runsDirectory, run);
	}

	return await eventEnding(reading, latest);
}
async function recordedEnding({
	runsDirectory,
	run,
	paths,
	runEvents,
}: RunEndingReading): Promise<RunEnding | undefined> {
	const stopped = await stoppedStage(runsDirectory, run);
	if (stopped !== undefined) {
		return { error: stopped.error, kind: "stopped", stage: stopped.stage };
	}

	const paused = await pausedStage(paths);
	if (paused !== undefined) {
		return { kind: "paused", stage: paused };
	}

	if (await operatorStopped(paths)) {
		return { kind: "operator-stopped", stage: failedStage(runEvents, run) };
	}

	return undefined;
}
async function eventEnding(
	reading: RunEndingReading,
	latest: RunEvent,
): Promise<RunEnding> {
	const { runEvents, run } = reading;
	if (latest.kind === "run-interrupted") {
		return { kind: "interrupted", stage: latest.stage };
	}

	if (latest.kind === "run-failed") {
		return { kind: "failed", stage: failedStage(runEvents, run) };
	}

	if (!isNonTerminal(latest)) {
		return { kind: "completed-without-artifact", stage: latest.stage };
	}

	return await claimedEnding(reading, latest);
}
async function claimedEnding(
	{ runEvents, paths, liveness, run }: RunEndingReading,
	latest: NonTerminalRunEvent,
): Promise<RunEnding> {
	const claim = await runClaim(
		paths.manifestFile,
		liveness,
		claimingRun(runEvents, run),
	);
	switch (claim) {
		case "live": {
			return { kind: "running", latest };
		}
		/**
		 * A run's end records its terminal event before teardown deletes its
		 * claim, so a run with neither is one whose process died. Reconciliation
		 * records that only at a later server start; this reading writes
		 * nothing, so a read racing a run's own end corrects itself on the next
		 * poll.
		 */
		case "gone": {
			return { kind: "interrupted", stage: latest.stage };
		}
		/**
		 * A target that could not be asked is no evidence the process is gone,
		 * and an ended reading would offer a paid analysis of a run still
		 * executing.
		 */
		case "unknown": {
			return { kind: "unconfirmed", stage: latest.stage };
		}
		default: {
			return unhandled(claim, "run claim");
		}
	}
}

/**
 * A run with no events was recorded before the event store, or its process
 * died before its first event. A stage it left awaiting judgment says where
 * it died, and no claim is asked: a run in flight has a latest event, so one
 * without any is not running.
 */
async function withoutEvents(
	runsDirectory: string,
	run: string,
): Promise<RunEnding> {
	const awaiting = await awaitingJudgeStage(runsDirectory, run);
	if (awaiting === undefined) {
		return { kind: "no-events" };
	}

	return { kind: "awaiting-judgment", stage: awaiting };
}

export { runEnding as default };
export type { NonTerminalRunEvent, RunEnding };
