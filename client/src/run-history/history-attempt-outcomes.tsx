import attemptLabel from "#client/attempt-label";
import plural from "#client/plural";
import type { StatusState, StatusTone } from "#client/system/components/status";

import type { GroupRow } from "./history-comparison-choice";
import type { OutcomePhrase } from "./history-run-outcomes";
import type { SessionAttemptRow } from "./history-session-grades";
import type { ReplayRow } from "./history-step-grades";
import { recordedReps } from "./history-step-grades";
import { NO_FAILED_RESULTS } from "./history-table-contract";

function replayOutcome(row: ReplayRow): OutcomePhrase {
	return {
		phrase: `verdict ${row.status}`,
		reason:
			row.attempt === undefined
				? "attempt position not recorded"
				: `${attemptLabel(row.attempt)} at this checkpoint`,
		state: row.status === "CONTINUE" ? "accepted" : "stopped",
		tone: row.status === "CONTINUE" ? "positive" : "attention",
	};
}

function groupOutcome(row: GroupRow): OutcomePhrase {
	const recorded = recordedReps(row);
	const unread = row.unreadReps.map(
		({ repId, reason }) => `${repId}: ${reason}`,
	);

	return {
		phrase: `${String(recorded)} of ${String(row.reps)} recorded`,
		reason: [
			`${String(row.successful)} recorded successful${row.mode === "session" ? " on reply/transcript checks" : ""}`,
			...unread,
		].join(" · "),
		state: recorded === row.reps ? "accepted" : "interrupted",
	};
}

const SESSION_OUTCOMES = {
	EXECUTION_FAILED: {
		phrase: "failed to run",
		state: "interrupted",
		tone: "attention",
	},
	NO_REPLY: { phrase: "no reply", state: "interrupted", tone: "attention" },
	SUCCESSFUL: {
		phrase: "recorded successful",
		state: "accepted",
		tone: "positive",
	},
	UNSUCCESSFUL: {
		phrase: "recorded unsuccessful",
		state: "stopped",
		tone: "negative",
	},
} as const satisfies Record<
	SessionAttemptRow["status"],
	{
		readonly state: StatusState;
		readonly tone: StatusTone;
		readonly phrase: string;
	}
>;

function sessionOutcome(row: SessionAttemptRow): OutcomePhrase {
	const { checks } = row;
	if (checks.state === "unavailable") {
		return {
			...SESSION_OUTCOMES[row.status],
			reason: checks.reasons.join("; "),
		};
	}

	const failed = checks.declared - checks.passed;

	return {
		...SESSION_OUTCOMES[row.status],
		reason:
			failed === NO_FAILED_RESULTS
				? "all reply/transcript checks passed"
				: `${String(failed)} of ${plural(checks.declared, "reply/transcript check")} failed`,
	};
}

export { groupOutcome, replayOutcome, sessionOutcome };
