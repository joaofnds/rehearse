import SavedStateSummary from "#client/saved-state-summary";
import StateBadge from "#client/system/components/state-badge";

import {
	groupOutcome,
	replayOutcome,
	sessionOutcome,
} from "./history-attempt-outcomes";
import type { ArmChoice } from "./history-comparison-choice";
import { CompareChoice } from "./history-comparison-choice";
import {
	otherRunOutcome,
	outcome,
	outcomeOf,
	runPhrase,
	runningPhrase,
} from "./history-run-outcomes";
import { SessionGroupState } from "./history-session-grades";
import type { HistoryRow, RunHistoryRow } from "./history-table-contract";
import { RunControls } from "./run-controls";
import { runStatusState } from "./run-status";

function outcomeCell(row: HistoryRow, choice: ArmChoice): React.JSX.Element {
	switch (row.kind) {
		case "run": {
			return runOutcomeCell(row);
		}
		case "session-attempt": {
			const recordedPassed =
				row.checks.state === "available"
					? row.status === "SUCCESSFUL"
					: undefined;
			return (
				<span className="flex flex-col items-start gap-2">
					{outcomeOf(sessionOutcome(row))}
					<SavedStateSummary
						assessment={row.savedState}
						recordedPassed={recordedPassed}
					/>
				</span>
			);
		}
		case "replay": {
			return outcomeOf(replayOutcome(row));
		}
		case "group": {
			return (
				<span className="flex flex-col gap-0.5">
					{outcome(groupOutcome(row))}
					<SessionGroupState row={row} />
					<CompareChoice row={row} choice={choice} />
				</span>
			);
		}
		default: {
			return row satisfies never;
		}
	}
}

function runOutcomeCell(row: RunHistoryRow): React.JSX.Element {
	if (row.progress.state === "running") {
		return (
			<span className="flex flex-col gap-0.5">
				{outcome({
					phrase: runningPhrase(row.progress.stage, row.stageGrades),
					reason: `${row.progress.stage} · ${row.progress.stageState}`,
					state: "running",
				})}
				<RunControls key={row.recordId} launchId={row.launchId} run={row.run} />
			</span>
		);
	}
	if (row.status === "AWAITING_HUMAN_REVIEW") {
		return (
			<span className="flex flex-col items-start gap-1">
				<StateBadge tone="neutral">Execution ended</StateBadge>
				{row.finalOutcome.state === "available" &&
				row.finalOutcome.status === "JUDGED" ? (
					<StateBadge
						tone={row.finalOutcome.verdict === "FAIL" ? "negative" : "positive"}
					>
						Final outcome {row.finalOutcome.verdict}
					</StateBadge>
				) : (
					<span className="text-12 text-dim">Final outcome unavailable</span>
				)}
				<StateBadge tone="attention">Human review pending</StateBadge>
				<details>
					<summary className="cursor-pointer text-14 text-dim">
						Recorded status
					</summary>
					<code className="select-all text-12">{row.status}</code>
				</details>
			</span>
		);
	}
	const reading = runPhrase(row);

	return reading === undefined
		? otherRunOutcome(row)
		: outcomeOf({ state: runStatusState(row.status), ...reading });
}

export { outcomeCell as default };
