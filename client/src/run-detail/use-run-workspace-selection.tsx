import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import type {
	MonitoredStage,
	RunRecordResponse,
} from "#client/monitor/run-record-query";

import type { RunDetailSearch, RunWorkspaceView } from "./run-detail-search";
import type { PipelineRow } from "./run-record-readings";
import {
	NO_SELECTED_STAGE_NUMBER,
	STAGE_NUMBER_BASE,
	selectedStage,
} from "./run-record-readings";

interface RunWorkspaceSelection {
	readonly view: RunWorkspaceView;
	readonly selected: MonitoredStage | undefined;
	readonly choose: (view: RunWorkspaceView, step?: string) => void;
	readonly number: number;
}

function useRunWorkspaceSelection(
	row: PipelineRow,
	record: RunRecordResponse,
	search: RunDetailSearch,
): RunWorkspaceSelection {
	const navigate = useNavigate();
	const [openedView] = useState<RunWorkspaceView>(
		row.progress.state === "running" ? "activity" : "results",
	);
	const view =
		search.view ?? (search.layout === undefined ? openedView : "results");
	const [lastLiveStep, setLastLiveStep] = useState(
		selectedStage(row, record, search.step)?.stage,
	);
	const runningStep =
		row.progress.state === "running" ? row.progress.stage : undefined;
	useEffect(() => {
		if (search.step === undefined && runningStep !== undefined) {
			setLastLiveStep(runningStep);
		}
	}, [runningStep, search.step]);
	const selected = selectedStage(
		row,
		record,
		search.step ?? runningStep ?? lastLiveStep,
	);
	const choose = (nextView: RunWorkspaceView, step = selected?.stage): void => {
		void navigate({
			params: { run: row.run },
			search: { step, view: nextView },
			to: "/runs/$run",
		});
	};
	const number =
		selected === undefined
			? NO_SELECTED_STAGE_NUMBER
			: record.stages.indexOf(selected) + STAGE_NUMBER_BASE;

	return { choose, number, selected, view };
}

export { useRunWorkspaceSelection as default };
export type { RunWorkspaceSelection };
