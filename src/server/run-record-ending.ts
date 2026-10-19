import { unhandled } from "#benchmark/contracts";
import runEnding from "#benchmark/run-ending";
import type { RunEnding } from "#benchmark/run-ending";
import type { RunEventStore } from "#benchmark/run-events";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import type { RunLocation } from "#benchmark/run-layout";
import type { RunLiveness } from "#benchmark/run-liveness";
import { redactAbsolutePaths } from "#server/redact-path";
import type { FinalOutcome, Reading } from "#server/run-record-contract";
import {
	AWAITING_JUDGMENT_REASON,
	INTERRUPTED_REASON,
	OPERATOR_STOPPED_REASON,
	PAUSED_REASON,
	RUN_FAILED_REASON,
	UNEXPLAINED_END_REASON,
	UNREADABLE_ENDING_REASON,
} from "#server/run-record-reasons";
import {
	failedJudgeArtifactSchema,
	gradedArtifactSchema,
} from "#server/run-stage-file";
import { endingIdentity } from "#server/run-status";

const UNREACHED_ENDING_REASONS = {
	"awaiting-judgment": AWAITING_JUDGMENT_REASON,
	"completed-without-artifact": UNEXPLAINED_END_REASON,
	failed: RUN_FAILED_REASON,
	interrupted: INTERRUPTED_REASON,
	"operator-stopped": OPERATOR_STOPPED_REASON,
	paused: PAUSED_REASON,
};

type EndingReading = Reading<{ readonly ending: RunEnding }>;

/**
 * Read once per record, so the status and the final outcome name the same
 * ending even while the run's records change between the two.
 */
async function readEnding(
	{ runsDirectory, run }: RunLocation,
	runEvents: RunEventStore,
	liveness: RunLiveness,
): Promise<EndingReading> {
	try {
		return {
			ending: await runEnding({ run, runsDirectory }, runEvents, liveness),
			state: "available",
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		return { reasons: [redactAbsolutePaths(message)], state: "unavailable" };
	}
}

/**
 * The final judge's outcome once the main artifact holds it, and otherwise
 * the ending the other records name, so the outcome names the same ending as
 * the run's status.
 */
async function finalOutcome(
	runsDirectory: string,
	run: string,
	reading: EndingReading,
): Promise<FinalOutcome> {
	if (reading.state === "unavailable") {
		return { reason: UNREADABLE_ENDING_REASON, status: "NOT_REACHED" };
	}

	const { ending } = reading;
	switch (ending.kind) {
		case "main-artifact": {
			return judgedOutcome(
				await Bun.file(
					benchmarkRunPaths(runsDirectory, run).artifactFile,
				).text(),
			);
		}
		case "stopped":
		case "paused":
		case "operator-stopped":
		case "interrupted":
		case "failed":
		case "completed-without-artifact":
		case "awaiting-judgment": {
			return {
				reason:
					ending.kind === "stopped"
						? ending.error
						: UNREACHED_ENDING_REASONS[ending.kind],
				stage: ending.stage,
				status: "NOT_REACHED",
			};
		}
		case "running":
		case "unconfirmed": {
			return {
				stage: ending.kind === "running" ? ending.latest.stage : ending.stage,
				status: "PENDING",
			};
		}
		case "no-events": {
			return { reason: UNEXPLAINED_END_REASON, status: "NOT_REACHED" };
		}
		default: {
			return unhandled(ending, "run ending");
		}
	}
}

function judgedOutcome(artifactText: string): FinalOutcome {
	const artifact: unknown = JSON.parse(artifactText);
	const graded = gradedArtifactSchema.safeParse(artifact);
	if (graded.success) {
		return { status: "JUDGED", verdict: graded.data.grade.verdict };
	}

	return {
		reason: failedJudgeArtifactSchema.parse(artifact).failure,
		status: "JUDGING_FAILED",
	};
}

async function statusReading(
	{ runsDirectory, run }: RunLocation,
	runEvents: RunEventStore,
	reading: EndingReading,
): Promise<Reading<{ readonly status: string }>> {
	if (reading.state === "unavailable") {
		return reading;
	}

	try {
		const identity = await endingIdentity(
			{ run, runsDirectory },
			reading.ending,
			runEvents,
		);
		if (identity === undefined) {
			return {
				reasons: ["run history lists no row for the run"],
				state: "unavailable",
			};
		}

		return { state: "available", status: identity.status };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		return { reasons: [redactAbsolutePaths(message)], state: "unavailable" };
	}
}

export { readEnding, finalOutcome, statusReading };
