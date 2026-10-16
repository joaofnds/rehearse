import { useQuery } from "@tanstack/react-query";
import type {
	MonitoredStage,
	RunRecordResponse,
} from "#client/monitor/run-record-query";
import type { PipelineRow } from "#client/shell/run-in-flight";
import { nodeStatus } from "#client/monitor/task-graph";
import { hasRunEnded } from "#client/run-history/run-status";
import {
	SavedOutput,
	savedOutputInitialMode,
} from "#client/session-history/attempt-evidence";
import { stageOutputQuery } from "./investigation-query";

export function PipelineOutput({
	run,
	stage,
	row,
	record,
}: {
	readonly run: string;
	readonly stage: MonitoredStage;
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
}): React.JSX.Element {
	const output = useQuery(stageOutputQuery(run, stage.stage));
	const saved = output.data?.state === "available" ? output.data : undefined;
	const status = nodeStatus(stage, row, record);
	let emptyMessage = "Output unavailable in this saved record.";
	if (status.state === "running" || status.state === "pending") {
		emptyMessage = "In progress · waiting for this step’s saved output.";
	} else if (status.state === "queued") {
		emptyMessage = hasRunEnded(row)
			? "Not reached · this step never ran, so it has no output."
			: "Not started · this step has no output yet.";
	} else if (status.state === "interrupted") {
		emptyMessage =
			"Incomplete · execution ended without a saved completion output.";
	}
	let note = "Output retained with this step’s Judge input";
	if (output.isError) {
		note = "The saved output could not be read.";
	} else if (output.data?.state === "unavailable") {
		note = output.data.reason;
	} else if (saved !== undefined) {
		switch (saved.kind) {
			case "artifact": {
				note = `${saved.path ?? "Artifact"} · saved input to the step Judge`;
				break;
			}
			case "reply": {
				note = "Completed agent reply saved with the step Judge input";
				break;
			}
			case "diff": {
				note =
					"Saved delivery diff · no artifact or completed reply was retained";
				break;
			}
			default: {
				saved.kind satisfies never;
			}
		}
	}
	return (
		<SavedOutput
			title="Saved output"
			initialMode={savedOutputInitialMode(saved)}
			text={saved?.text}
			note={note}
			emptyMessage={emptyMessage}
			pending={output.isPending}
		/>
	);
}
