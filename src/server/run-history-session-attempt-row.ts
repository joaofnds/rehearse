import { unhandled } from "#benchmark/contracts";
import type { Immutable } from "#benchmark/contracts";
import type { LaunchRecord } from "#benchmark/launch-record";
import { stoppedBeforeAttemptRecord } from "#benchmark/operator-stop";
import { sessionAttemptPaths } from "#benchmark/run-layout";
import type {
	SessionAttemptId,
	SessionAttemptPaths,
} from "#benchmark/run-layout";
import readSessionAttemptRecord from "#benchmark/session-attempt-record-read";
import { attemptStartedAt } from "#benchmark/session-record";
import type { SessionAttemptRecord } from "#benchmark/session-record";
import { formatRecordId } from "#cli/record-id";
import type { SessionAttemptRow, Unjudged } from "#server/run-history-contract";
import heldInFlight from "#server/run-history-in-flight";
import savedStateAssessment from "#server/saved-state-assessment";

const SESSION_COST_REASON = "the attempt recorded no call metrics";

const NO_REPLY_CHECKS_REASON = "the session gave no reply, so no check ran";

const EXECUTION_FAILED_CHECKS_REASON =
	"the session failed to run, so no check ran";

/**
 * A checked attempt records one result per declared check, so an attempt
 * with none is one whose session left nothing to check.
 */
function sessionChecks(
	record: Immutable<SessionAttemptRecord>,
): SessionAttemptRow["checks"] {
	switch (record.outcome) {
		case "NO_REPLY": {
			return { reasons: [NO_REPLY_CHECKS_REASON], state: "unavailable" };
		}
		case "EXECUTION_FAILED": {
			return {
				reasons: [EXECUTION_FAILED_CHECKS_REASON],
				state: "unavailable",
			};
		}
		case "SUCCESSFUL":
		case "UNSUCCESSFUL": {
			return {
				declared: record.checks.length,
				passed: record.checks.filter(({ status }) => status === "PASS").length,
				state: "available",
			};
		}
		default: {
			return unhandled(record, "session attempt outcome");
		}
	}
}

interface SessionAttemptRowRequest {
	readonly runsDirectory: string;
	readonly attempt: SessionAttemptId;
	readonly shortId: string | undefined;
	readonly launchByPid: ReadonlyMap<number, LaunchRecord>;
}

/**
 * An attempt with no record is left out while a live launch holds its writer
 * or once the operator stopped it.
 */
async function leftOut(
	paths: SessionAttemptPaths,
	launchByPid: ReadonlyMap<number, LaunchRecord>,
): Promise<boolean> {
	return (
		(await heldInFlight(paths.directory, launchByPid)) ||
		(await stoppedBeforeAttemptRecord(paths))
	);
}

/**
 * Undefined for an attempt with no record whose writer a live launch holds,
 * since the launch's own row stands for it until the record is written, and
 * for one the operator stopped before its record, which writes none.
 */
async function sessionAttemptRow({
	runsDirectory,
	attempt,
	shortId,
	launchByPid,
}: SessionAttemptRowRequest): Promise<Unjudged<SessionAttemptRow> | undefined> {
	const paths = sessionAttemptPaths(runsDirectory, attempt);
	const record = await readSessionAttemptRecord(
		paths,
		async () => await leftOut(paths, launchByPid),
	);
	if (record === undefined) {
		return undefined;
	}

	const recordId = formatRecordId({ kind: "attempt:session", ...attempt });

	return {
		caseId: attempt.caseId,
		checks: sessionChecks(record),
		corpusVersion: record.corpusVersion,
		cost:
			record.metrics === undefined
				? { reasons: [SESSION_COST_REASON], state: "unavailable" }
				: {
						missing: [],
						parts: [{ part: "session", usd: record.metrics.costUsd }],
						state: "available",
						usd: record.metrics.costUsd,
					},
		kind: "session-attempt",
		links: [
			{
				href: `/attempts/session/${encodeURIComponent(attempt.caseId)}/${encodeURIComponent(attempt.uuid)}`,
				label: "context",
				state: "available",
			},
		],
		recordId,
		savedState: savedStateAssessment(record),
		shortId,
		startedAt: attemptStartedAt(record),
		status: record.outcome,
		uuid: attempt.uuid,
		wallTime: { ms: record.elapsedMs, state: "available" },
	};
}

export {
	SESSION_COST_REASON,
	NO_REPLY_CHECKS_REASON,
	EXECUTION_FAILED_CHECKS_REASON,
	sessionAttemptRow,
};
