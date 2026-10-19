import plural from "#client/plural";
import type { OutcomeReading } from "#client/run-detail/task-grade-card";
import {
	JUDGED_NOTE,
	NOT_RETURNED,
	outcomeReading,
} from "#client/run-detail/task-grade-card";
import Disclosure from "#client/system/components/disclosure";
import SESSION_GRADE_REASON from "#server/session-grade-reason";

import type { GroupRow } from "./history-comparison-choice";
import { disclosureKeyOf } from "./history-corpus-state";
import { NOT_APPLICABLE, STEP_REPLAY_ONLY } from "./history-step-grades";
import type { HistoryRow, RunHistoryRow } from "./history-table-contract";
import {
	NO_FINAL_OUTCOME_RESULTS,
	NO_JUDGED_RESULTS,
} from "./history-table-contract";

function taskGrade(
	row: HistoryRow,
	{ value, note }: OutcomeReading,
): React.JSX.Element {
	return (
		<span className="flex flex-col gap-0.5">
			<span className="font-mono text-14 font-bold">{value}</span>
			<Disclosure
				key={disclosureKeyOf(row)}
				collapsedLabel={note === JUDGED_NOTE ? "independent" : "details"}
				expandedLabel="hide"
			>
				<span className="max-w-note text-12 text-dim">{note}</span>
			</Disclosure>
		</span>
	);
}

function runTaskGrade(
	finalOutcome: RunHistoryRow["finalOutcome"],
): OutcomeReading {
	if (finalOutcome.state === "unavailable") {
		return { note: finalOutcome.reasons.join("; "), value: NOT_RETURNED };
	}

	return outcomeReading(finalOutcome);
}

function groupTaskGrade(row: GroupRow): OutcomeReading {
	switch (row.mode) {
		case "pipeline": {
			const passed = row.finalOutcomes["PASS"] ?? NO_FINAL_OUTCOME_RESULTS;
			const judged =
				passed + (row.finalOutcomes["FAIL"] ?? NO_FINAL_OUTCOME_RESULTS);
			const unjudged = `${String(row.reps - judged)} of ${plural(row.reps, "rep")} not judged`;
			if (judged === NO_JUDGED_RESULTS) {
				return { note: `not reached · ${unjudged}`, value: NOT_RETURNED };
			}

			return {
				note:
					judged === row.reps ? JUDGED_NOTE : `${JUDGED_NOTE} · ${unjudged}`,
				value: `${String(passed)} of ${String(judged)} PASS`,
			};
		}
		case "stage": {
			return { note: STEP_REPLAY_ONLY, value: NOT_APPLICABLE };
		}
		case "session": {
			return { note: SESSION_GRADE_REASON, value: NOT_APPLICABLE };
		}
		default: {
			return row.mode satisfies never;
		}
	}
}

function taskGradeCell(row: HistoryRow): React.JSX.Element {
	switch (row.kind) {
		case "run": {
			return taskGrade(row, runTaskGrade(row.finalOutcome));
		}
		case "replay": {
			return taskGrade(row, { note: STEP_REPLAY_ONLY, value: NOT_APPLICABLE });
		}
		case "group": {
			return taskGrade(row, groupTaskGrade(row));
		}
		case "session-attempt": {
			return taskGrade(row, {
				note: SESSION_GRADE_REASON,
				value: NOT_APPLICABLE,
			});
		}
		default: {
			return row satisfies never;
		}
	}
}

export { taskGradeCell as default };
