import { unhandled } from "./contracts";
import { operatorStopped } from "./operator-stop";
import type {
	NonTerminalRunEventKind,
	RunEvent,
	RunEventStore,
} from "./run-events";
import { isTerminalRunEventKind } from "./run-events";
import { benchmarkRunPaths } from "./run-layout";
import type { RunLiveness } from "./run-liveness";
import { claimingRun, runClaim } from "./run-liveness";
import { awaitingJudgeStage, stoppedStage } from "./run-outcome";
import { pausedStage } from "./run-pause";

/** An event of a kind that does not end a run's event stream. */
export type NonTerminalRunEvent = RunEvent & {
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
export type RunEnding =
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
		.eventsSince(run, 0)
		.map(({ stage }) => stage)
		.findLast((stage) => stage !== "");
}

export async function runEnding(
	runsDirectory: string,
	run: string,
	runEvents: RunEventStore,
	liveness: RunLiveness,
): Promise<RunEnding> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	if (await Bun.file(paths.artifactFile).exists()) {
		return { kind: "main-artifact" };
	}

	const stopped = await stoppedStage(runsDirectory, run);
	if (stopped !== undefined) {
		return { kind: "stopped", stage: stopped.stage, error: stopped.error };
	}

	const paused = await pausedStage(paths);
	if (paused !== undefined) {
		return { kind: "paused", stage: paused };
	}

	if (await operatorStopped(paths)) {
		return { kind: "operator-stopped", stage: failedStage(runEvents, run) };
	}

	const latest = runEvents.latestEvent(run);
	if (latest === undefined) {
		return withoutEvents(runsDirectory, run);
	}

	/**
	 * A kill -9 leaves no artifact and no STAGE_JUDGE_FAILED file: nothing
	 * runs to write one. The reconciliation pass is the only thing that ever
	 * marks such a run, in the event stream rather than on disk.
	 */
	if (latest.kind === "run-interrupted") {
		return { kind: "interrupted", stage: latest.stage };
	}

	if (latest.kind === "run-failed") {
		return { kind: "failed", stage: failedStage(runEvents, run) };
	}

	/**
	 * A terminal kind here is not a run in flight even with a live marker on
	 * its target, and the one left is `run-completed` without the artifact
	 * that should have followed it.
	 */
	if (!isNonTerminal(latest)) {
		return { kind: "completed-without-artifact", stage: latest.stage };
	}

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
