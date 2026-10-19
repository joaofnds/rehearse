import plural from "#client/plural";
import Disclosure from "#client/system/components/disclosure";
import StateBadge from "#client/system/components/state-badge";

import type { GroupRow } from "./history-comparison-choice";
import { disclosureKeyOf } from "./history-corpus-state";
import {
	gradeTokens,
	groupStepGrades,
	placedGrades,
	reasonsLine,
	runStepGrades,
} from "./history-step-grades";
import type { HistoryRow } from "./history-table-contract";
import {
	EMPTY_COLLECTION_LENGTH,
	NO_ASSESSED_RESULTS,
	NO_FAILED_RESULTS,
	NO_RECORDED_DISAGREEMENTS,
	NO_UNAVAILABLE_RESULTS,
} from "./history-table-contract";

interface SessionGroupStateProps {
	readonly row: GroupRow;
}

function SessionGroupState({
	row,
}: SessionGroupStateProps): React.JSX.Element | null {
	if (row.mode !== "session") {
		return null;
	}
	const state = row.savedState;
	if (state === undefined) {
		return (
			<span className="text-12 text-muted-foreground">
				Saved state unavailable
			</span>
		);
	}
	const tone = sessionStateTone(state);
	return (
		<span className="mt-2 flex flex-col items-start gap-1">
			{state.assessed === NO_ASSESSED_RESULTS ? (
				<span className="text-12 text-muted-foreground">
					Saved state unavailable
				</span>
			) : (
				<StateBadge tone={tone}>
					Saved state: {state.passed} of {state.assessed} assessed attempts
					passed
				</StateBadge>
			)}
			<span className="text-12 text-muted-foreground">
				{state.failed} failed · {state.unavailable} of {state.total} unavailable
			</span>
			{state.disagreements > NO_RECORDED_DISAGREEMENTS ? (
				<StateBadge tone="attention">
					Assessment layers disagree in {plural(state.disagreements, "attempt")}
				</StateBadge>
			) : null}
			{state.unavailableReps.length > EMPTY_COLLECTION_LENGTH ? (
				<SessionStateCoverage row={row} state={state} />
			) : null}
		</span>
	);
}

type SessionAttemptRow = Extract<
	HistoryRow,
	{ readonly kind: "session-attempt" }
>;

function sessionStepGrades(row: SessionAttemptRow): React.JSX.Element {
	const { checks } = row;
	if (checks.state === "unavailable") {
		return (
			<span className="flex flex-col gap-0.5">
				<span className="font-mono text-12 text-dim">{row.status}</span>
				{reasonsLine(checks.reasons)}
			</span>
		);
	}

	return gradeTokens(
		`${String(checks.passed)} of ${plural(checks.declared, "reply/transcript check")} passed`,
	);
}

function stepGradesCell(row: HistoryRow): React.JSX.Element {
	switch (row.kind) {
		case "run": {
			return runStepGrades(row.stageGrades);
		}
		case "replay": {
			return placedGrades(
				row.pipelineStages,
				new Map([[row.stage, row.grade]]),
				"Not replayed",
			);
		}
		case "group": {
			return groupStepGrades(row);
		}
		case "session-attempt": {
			return sessionStepGrades(row);
		}
		default: {
			return row satisfies never;
		}
	}
}

type SessionSavedState = NonNullable<GroupRow["savedState"]>;

function sessionStateTone(
	state: SessionSavedState,
): "positive" | "negative" | "attention" {
	if (state.failed > NO_FAILED_RESULTS) {
		return "negative";
	}
	return state.unavailable > NO_UNAVAILABLE_RESULTS ? "attention" : "positive";
}

interface SessionStateCoverageProps {
	readonly row: GroupRow;
	readonly state: SessionSavedState;
}

function SessionStateCoverage({
	row,
	state,
}: SessionStateCoverageProps): React.JSX.Element {
	return (
		<Disclosure
			key={disclosureKeyOf(row)}
			collapsedLabel="Saved state coverage"
			expandedLabel="Hide saved state coverage"
		>
			<ul className="text-12 text-muted-foreground">
				{state.unavailableReps.map(({ repId, reason }) => (
					<li key={repId} className="py-1 wrap-anywhere">
						{repId}: {reason}
					</li>
				))}
			</ul>
		</Disclosure>
	);
}

export { SessionGroupState, stepGradesCell };
export type { SessionAttemptRow };
