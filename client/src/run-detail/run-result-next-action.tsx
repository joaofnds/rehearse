import { Link } from "@tanstack/react-router";

import type {
	MonitoredStage,
	RunRecordResponse,
} from "#client/monitor/run-record-query";
import { Button } from "#client/system/ui/button";

import ReplayButton from "./replay-button";
import type { RunWorkspaceView } from "./run-detail-search";
import type { PipelineRow } from "./run-record-readings";
import { defaultEndedStage } from "./run-record-readings";
import type { StepActions } from "./run-selected-step-actions";
import { stepActions } from "./run-selected-step-actions";

interface ResultNextActionProps {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
	readonly selected: MonitoredStage;
	readonly number: number;
	readonly finalCitations: boolean;
	readonly onInspectFinal: () => void;
}

function ResultNextAction({
	row,
	record,
	selected,
	number,
	finalCitations,
	onInspectFinal,
}: ResultNextActionProps): React.JSX.Element {
	const { skill, replayable } = stepActions(row, record, selected);
	const failedFinal =
		record.finalOutcome.status === "JUDGED" &&
		record.finalOutcome.verdict === "FAIL";

	return (
		<section
			aria-label="Next action"
			className="flex flex-wrap items-center gap-4 rounded-lg border border-divider bg-card p-5"
		>
			<h2 className="text-16 font-semibold">Next action</h2>
			<Button variant="primary" asChild>
				{resultPrimaryLink(
					{ finalCitations, number, onInspectFinal, record, row, selected },
					{ replayable, skill },
				)}
			</Button>
			{replayable && skill !== undefined && failedFinal ? (
				<Link
					to="/corpus"
					search={{
						file: skill,
						sourceRun: row.run,
						sourceStep: selected.stage,
					}}
					className="text-14 text-link underline"
				>
					Edit instruction &amp; replay
				</Link>
			) : null}
			{replayable ? (
				<ReplayButton
					run={row.run}
					record={record}
					stage={selected.stage}
					label={`Replay step ${String(number)}`}
				/>
			) : null}
		</section>
	);
}

function resultPrimaryLink(
	request: ResultNextActionProps,
	actions: StepActions,
): React.JSX.Element {
	const endedAt = defaultEndedStage(request.row, request.record);

	if (request.row.progress.state === "running") {
		return runStepLink({
			label: "Follow activity",
			run: request.row.run,
			step: request.selected.stage,
			view: "activity",
		});
	}

	if (request.selected.status === "no-record" && endedAt !== undefined) {
		return runStepLink({
			label: "Inspect ended step",
			run: request.row.run,
			step: endedAt.stage,
			view: "results",
		});
	}

	if (
		request.record.finalOutcome.status === "JUDGED" &&
		request.record.finalOutcome.verdict === "FAIL"
	) {
		return request.finalCitations ? (
			<a href="#final-criteria" onClick={request.onInspectFinal}>
				Inspect final evidence
			</a>
		) : (
			<a href="#task-grade-label">Review final outcome</a>
		);
	}

	if (actions.replayable && actions.skill !== undefined) {
		return instructionReplayLink(request, actions.skill);
	}

	return runStepLink({
		label: "Inspect activity",
		run: request.row.run,
		step: request.selected.stage,
		view: "activity",
	});
}

function instructionReplayLink(
	request: ResultNextActionProps,
	skill: string,
): React.JSX.Element {
	return (
		<Link
			to="/corpus"
			search={{
				file: skill,
				sourceRun: request.row.run,
				sourceStep: request.selected.stage,
			}}
		>
			Edit instruction &amp; replay
		</Link>
	);
}

interface RunStepLink {
	readonly run: string;
	readonly step: string;
	readonly view: RunWorkspaceView;
	readonly label: string;
}

function runStepLink({
	run,
	step,
	view,
	label,
}: RunStepLink): React.JSX.Element {
	return (
		<Link to="/runs/$run" params={{ run }} search={{ step, view }}>
			{label}
		</Link>
	);
}

export { ResultNextAction as default };
