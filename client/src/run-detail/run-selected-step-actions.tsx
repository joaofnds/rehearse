import { Link } from "@tanstack/react-router";

import type {
	MonitoredStage,
	RunRecordResponse,
} from "#client/monitor/run-record-query";
import { stageReplayRefusal } from "#client/monitor/run-record-query";
import StepModalAction from "#client/monitor/step-modal";
import { hasRunEnded } from "#client/run-history/run-status";
import { Button } from "#client/system/ui/button";

import CheckpointAttempts from "./checkpoint-attempts";
import ReplayButton from "./replay-button";
import type { PipelineRow } from "./run-record-readings";
import { StepReport } from "./step-report";

interface StepActions {
	readonly skill: string | undefined;
	readonly replayable: boolean;
}

function stepActions(
	row: PipelineRow,
	record: RunRecordResponse,
	selected: MonitoredStage,
): StepActions {
	return {
		replayable:
			row.replayableStages.includes(selected.stage) &&
			hasRunEnded(row) &&
			stageReplayRefusal(record, selected.stage) === undefined,
		skill:
			selected.readManifest.state === "available"
				? selected.readManifest.entries.find(
						({ role, half }) => role === "stage skill" && half === "corpus",
					)?.path
				: undefined,
	};
}

interface RunStepInspectionProps {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
	readonly selected: MonitoredStage;
	readonly number: number;
}

function SelectedStepActions({
	row,
	record,
	selected,
	number,
}: RunStepInspectionProps): React.JSX.Element {
	const { skill, replayable } = stepActions(row, record, selected);

	return (
		<div className="flex flex-none flex-wrap items-center gap-2 border-b border-divider page-gutter py-2">
			<span className="mr-auto text-12 text-muted-foreground">
				Selected step ·{" "}
				<span className="font-medium text-foreground">{selected.stage}</span>
			</span>
			<StepModalAction
				run={row.run}
				record={record}
				stage={selected}
				number={number}
			/>
			{replayable ? (
				<ReplayButton
					run={row.run}
					record={record}
					stage={selected.stage}
					label={`Replay step ${String(number)}`}
				/>
			) : null}
			{replayable && skill !== undefined ? (
				<Button asChild size="compact">
					<Link
						to="/corpus"
						search={{
							file: skill,
							sourceRun: row.run,
							sourceStep: selected.stage,
						}}
					>
						Edit instruction &amp; replay
					</Link>
				</Button>
			) : null}
		</div>
	);
}

function RunStepResult({
	row,
	record,
	selected,
	number,
}: RunStepInspectionProps): React.JSX.Element {
	return (
		<div className="grid items-start gap-6 2xl:grid-cols-main-aside">
			<StepReport
				run={row.run}
				row={row}
				record={record}
				stage={selected}
				number={number}
			/>
			<aside className="min-w-0">
				<CheckpointAttempts run={row.run} stage={selected} />
				{selected.grade.state === "available" ? (
					<p className="mt-4">
						<Link
							to="/calibration/runs/$run/stages/$stage"
							params={{ run: row.run, stage: selected.stage }}
							className="text-14 text-link underline underline-offset-4"
						>
							Review this Judge
						</Link>
					</p>
				) : null}
			</aside>
		</div>
	);
}

export { RunStepResult, SelectedStepActions, stepActions };
export type { StepActions };
