import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import type { RunRecordResponse } from "#client/monitor/run-record-query";
import { runRecordQuery } from "#client/monitor/run-record-query";
import { polledRunListingQuery } from "#client/run-history/run-history-polling";
import type { RunListingResponse } from "#client/run-history/run-history-query";

import type { AnalysisReadingResponse } from "./analysis-query";
import { analysesQuery } from "./analysis-query";
import { FINAL_ASSESSMENT_KEY, STAGE_OUTPUT_KEY } from "./investigation-query";
import type { HistoryRow, PipelineRow } from "./run-record-readings";
import { STAGE_ATTEMPTS_KEY } from "./stage-attempts-query";

function useWhenChanged(reading: string, onChanged: () => void): void {
	const previous = useRef(reading);
	useEffect(() => {
		if (previous.current !== reading) {
			onChanged();
		}
		previous.current = reading;
	}, [reading, onChanged]);
}

/**
 * Where the polled run history says the run is. A live run's record changes
 * as it moves from one step to the next and as it ends.
 */
function phaseOf(rows: readonly HistoryRow[], run: string): string {
	const row = rows.find(
		(each): each is PipelineRow => each.kind === "run" && each.run === run,
	);
	if (row === undefined) {
		return "unlisted";
	}

	return row.progress.state === "running"
		? `${row.status} at ${row.progress.stage}`
		: row.status;
}

interface RunDetailReads {
	readonly history: RunQueryReading<RunListingResponse>;
	readonly record: RunQueryReading<RunRecordResponse>;
	readonly analyses: RunQueryReading<AnalysisReadingResponse>;
	readonly analysisInFlight: boolean;
}

type RunQueryReading<Value> = Readonly<
	Pick<UseQueryResult<Value>, "data" | "isError">
>;

function useRunDetailReads(run: string): RunDetailReads {
	const history = useQuery(polledRunListingQuery);
	const record = useQuery(runRecordQuery(run));
	const analysisInFlight = (history.data?.launches ?? []).some(
		(launch) =>
			launch.target === "analysis" &&
			launch.run === run &&
			launch.status === "RUNNING",
	);
	const analyses = useQuery(analysesQuery(run));
	useRunDetailInvalidation(run, history.data, analysisInFlight);

	return { analyses, analysisInFlight, history, record };
}

function useRunDetailInvalidation(
	run: string,
	history: RunListingResponse | undefined,
	analysisInFlight: boolean,
): void {
	const queryClient = useQueryClient();
	// An analysis writes its record as its process ends, which the polled run
	// history shows as its launch leaving the list.
	useWhenChanged(String(analysisInFlight), () => {
		void queryClient.invalidateQueries({
			queryKey: analysesQuery(run).queryKey,
		});
	});
	useWhenChanged(phaseOf(history?.rows ?? [], run), () => {
		void queryClient.invalidateQueries({
			queryKey: runRecordQuery(run).queryKey,
		});
		void queryClient.invalidateQueries({ queryKey: ["session-history"] });
		void queryClient.invalidateQueries({ queryKey: ["stage-corpus"] });
		void queryClient.invalidateQueries({ queryKey: [STAGE_OUTPUT_KEY, run] });
		void queryClient.invalidateQueries({
			queryKey: [FINAL_ASSESSMENT_KEY, run],
		});
		// A stage the run finishes becomes an attempt at its checkpoint.
		void queryClient.invalidateQueries({
			queryKey: [STAGE_ATTEMPTS_KEY, run],
		});
	});
}

export { useRunDetailReads as default };
export type { RunDetailReads };
