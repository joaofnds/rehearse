import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";

import type {
	MonitoredStage,
	RunRecordResponse,
} from "#client/monitor/run-record-query";
import { nodeStatus } from "#client/monitor/task-graph";
import { hasRunEnded } from "#client/run-history/run-status";
import {
	SavedOutput,
	savedOutputInitialMode,
} from "#client/session-history/attempt-evidence";
import type { PipelineRow } from "#client/shell/run-in-flight";

import type { StageOutputResponse } from "./investigation-query";
import { stageOutputQuery } from "./investigation-query";

interface PipelineOutputProps {
	readonly run: string;
	readonly stage: MonitoredStage;
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
}

type RetainedStageOutput = Extract<
	StageOutputResponse,
	{ readonly state: "available" }
>;

interface PipelineOutputReading {
	readonly output: UseQueryResult<StageOutputResponse>;
	readonly saved: RetainedStageOutput | undefined;
	readonly status: ReturnType<typeof nodeStatus>;
}

function PipelineOutput(props: PipelineOutputProps): React.JSX.Element {
	const { output, saved, status } = usePipelineOutput(props);
	const emptyMessages = emptyOutputMessages(
		hasRunEnded(props.row)
			? "Not reached · this step never ran, so it has no output."
			: "Not started · this step has no output yet.",
	);
	let note = "Output retained with this step’s Judge input";
	if (output.isError) {
		note = "The saved output could not be read.";
	} else if (output.data?.state === "unavailable") {
		note = output.data.reason;
	} else if (saved !== undefined) {
		note = retainedOutputNote(saved);
	}

	return (
		<SavedOutput
			title="Saved output"
			initialMode={savedOutputInitialMode(saved)}
			text={saved?.text}
			note={note}
			emptyMessage={
				emptyMessages.get(status.state) ??
				"Output unavailable in this saved record."
			}
			pending={output.isPending}
		/>
	);
}

function usePipelineOutput({
	run,
	stage,
	row,
	record,
}: PipelineOutputProps): PipelineOutputReading {
	const output = useQuery(stageOutputQuery(run, stage.stage));
	const saved = output.data?.state === "available" ? output.data : undefined;
	const status = nodeStatus(stage, row, record);

	return { output, saved, status };
}

function emptyOutputMessages(queued: string): ReadonlyMap<string, string> {
	return new Map([
		["running", "In progress · waiting for this step’s saved output."],
		["pending", "In progress · waiting for this step’s saved output."],
		["queued", queued],
		[
			"interrupted",
			"Incomplete · execution ended without a saved completion output.",
		],
	]);
}

function retainedOutputNote(saved: RetainedStageOutput): string {
	const notes = {
		artifact: `${saved.path ?? "Artifact"} · saved input to the step Judge`,
		diff: "Saved delivery diff · no artifact or completed reply was retained",
		reply: "Completed agent reply saved with the step Judge input",
	};
	return notes[saved.kind];
}

export { PipelineOutput as default };
