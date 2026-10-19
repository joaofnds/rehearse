import { unhandled } from "#benchmark/contracts";
import type { Immutable } from "#benchmark/contracts";
import { sessionAttemptPaths } from "#benchmark/run-layout";
import type { SessionAttemptId } from "#benchmark/run-layout";
import {
	attemptStartedAt,
	parseSessionAttemptRecord,
} from "#benchmark/session-record";
import type { SessionAttemptRecord } from "#benchmark/session-record";
import { formatRecordId } from "#cli/record-id";
import type { SessionAttemptRow, Unjudged } from "#server/run-history-contract";
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

async function sessionAttemptRow(
	runsDirectory: string,
	attempt: SessionAttemptId,
	shortId: string | undefined,
): Promise<Unjudged<SessionAttemptRow>> {
	const { recordFile } = sessionAttemptPaths(runsDirectory, attempt);
	if (!(await Bun.file(recordFile).exists())) {
		throw new Error("incomplete: no attempt.json recorded");
	}

	const record = parseSessionAttemptRecord(await Bun.file(recordFile).text());
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
