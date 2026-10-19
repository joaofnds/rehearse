import { isStopped, stoppedStageOf } from "#benchmark/stopped-status";
import type { StatusState, StatusTone } from "#client/system/components/status";
import { Status } from "#client/system/components/status";

import type { StageGrade, StageGrades } from "./history-step-grades";
import type { RunHistoryRow } from "./history-table-contract";
import { MISSING_SEQUENCE_INDEX, ORDINAL_BASE } from "./history-table-contract";
import { RunControls } from "./run-controls";
import { runStatusState } from "./run-status";

type RunPhrase = Omit<OutcomePhrase, "state">;

function runPhrase(row: RunHistoryRow): RunPhrase | undefined {
	if (isStopped(row.status)) {
		return stoppedOutcome(row, stoppedStageOf(row.status));
	}

	switch (row.status) {
		case "COMPLETE": {
			return completedOutcome(row.stageGrades);
		}
		case "INTERRUPTED":
		case "FAILED": {
			return interruptedOutcome(row);
		}
		default: {
			return undefined;
		}
	}
}

function otherRunOutcome(row: RunHistoryRow): React.JSX.Element {
	return (
		<span className="flex flex-col gap-0.5">
			<Status state={runStatusState(row.status)} />
			<span className="font-mono text-12 text-dim">{row.status}</span>
			{row.status === "RUNNING" ? (
				<RunControls key={row.recordId} launchId={row.launchId} run={row.run} />
			) : null}
		</span>
	);
}

interface OutcomePhrase {
	readonly state: StatusState;
	readonly tone?: StatusTone;
	readonly phrase: string;
	readonly reason: React.ReactNode;
}

function outcomeOf(reading: OutcomePhrase): React.JSX.Element {
	return <span className="flex flex-col gap-0.5">{outcome(reading)}</span>;
}

function outcome({
	state,
	phrase,
	reason,
	tone,
}: OutcomePhrase): React.JSX.Element {
	return (
		<>
			<span className="whitespace-nowrap">
				<Status state={state} label={phrase} tone={tone} />
			</span>
			<span className="text-12 text-dim">{reason}</span>
		</>
	);
}

function stepOf(
	stage: string,
	stageGrades: StageGrades,
): { readonly step: number; readonly of: number } | undefined {
	if (stageGrades.state === "unavailable") {
		return undefined;
	}

	const index = stageGrades.grades.findIndex((each) => each.stage === stage);

	return index === MISSING_SEQUENCE_INDEX
		? undefined
		: { of: stageGrades.grades.length, step: index + ORDINAL_BASE };
}

function runningPhrase(stage: string, stageGrades: StageGrades): string {
	const place = stepOf(stage, stageGrades);

	return place === undefined
		? "running"
		: `running · step ${String(place.step)} of ${String(place.of)}`;
}

function atStep(lead: string, stage: string, stageGrades: StageGrades): string {
	const place = stepOf(stage, stageGrades);

	return place === undefined
		? `${lead} ${stage}`
		: `${lead} step ${String(place.step)}`;
}

function gradeOf(
	stage: string,
	stageGrades: StageGrades,
): StageGrade | undefined {
	return stageGrades.state === "available"
		? stageGrades.grades.find((each) => each.stage === stage)?.grade
		: undefined;
}

function stoppedGrade(stage: string, grade: StageGrade | undefined): string {
	if (grade === undefined) {
		return stage;
	}
	if (grade.state === "unavailable") {
		return `${stage} · ${grade.reasons.join("; ")}`;
	}

	return `${stage} ${grade.letter}`;
}

function minimumReading(minimumGrade: RunHistoryRow["minimumGrade"]): string {
	return minimumGrade.state === "available"
		? `below minimum ${minimumGrade.letter}`
		: minimumGrade.reasons.join("; ");
}

function stoppedOutcome(row: RunHistoryRow, stage: string): RunPhrase {
	return {
		phrase: atStep("stopped at", stage, row.stageGrades),
		reason: (
			<a
				href={`/runs/${encodeURIComponent(row.run)}/stages/${encodeURIComponent(stage)}`}
				className="inline-flex items-start self-start text-link underline decoration-link/60 underline-offset-4 hover:text-link-hover"
			>
				<span className="line-clamp-2 break-words">
					{stopReason(row, stage)}
				</span>
			</a>
		),
	};
}

function stopReason(row: RunHistoryRow, stage: string): string {
	const grade = gradeOf(stage, row.stageGrades);
	const fellBelow = grade?.state === "available" && !grade.reachesMinimum;
	if (
		!fellBelow &&
		row.finalOutcome.state === "available" &&
		row.finalOutcome.status === "NOT_REACHED"
	) {
		return `${stage} · ${row.finalOutcome.reason}`;
	}

	return `${stoppedGrade(stage, grade)} · ${minimumReading(row.minimumGrade)}`;
}

function completedOutcome(stageGrades: StageGrades): RunPhrase {
	if (stageGrades.state === "unavailable") {
		return {
			phrase: "completed",
			reason: stageGrades.reasons.join("; "),
		};
	}

	const steps = stageGrades.grades.length;
	const reached = stageGrades.grades.filter(
		({ grade }) => grade.state === "available" && grade.reachesMinimum,
	).length;

	return {
		phrase: `completed ${String(steps)} of ${String(steps)}`,
		reason:
			reached === steps
				? "all steps at or above minimum"
				: `${String(reached)} of ${String(steps)} steps graded at or above minimum`,
	};
}

function interruptedOutcome(row: RunHistoryRow): RunPhrase {
	const { finalOutcome } = row;
	if (finalOutcome.state === "unavailable") {
		return {
			phrase: "interrupted",
			reason: finalOutcome.reasons.join("; "),
		};
	}
	if (finalOutcome.status === "JUDGING_FAILED") {
		return {
			phrase: "final judge failed",
			reason: finalOutcome.reason,
		};
	}
	if (finalOutcome.status !== "NOT_REACHED") {
		return { phrase: "interrupted", reason: row.status };
	}

	if (finalOutcome.stage === undefined) {
		return { phrase: "interrupted", reason: finalOutcome.reason };
	}

	return {
		phrase: atStep("interrupted at", finalOutcome.stage, row.stageGrades),
		reason: `${finalOutcome.stage} · ${finalOutcome.reason}`,
	};
}

export {
	atStep,
	otherRunOutcome,
	outcome,
	outcomeOf,
	runningPhrase,
	runPhrase,
};
export type { OutcomePhrase, RunPhrase };
