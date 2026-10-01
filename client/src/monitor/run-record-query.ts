import type { InferResponseType } from "hono/client";
import { apiClient } from "#client/api-client";

const runRecordRoute = apiClient.api.runs[":run"];

export type RunRecordResponse = InferResponseType<
	typeof runRecordRoute.$get,
	200
>;

export type MonitoredStage = RunRecordResponse["stages"][number];

/**
 * How a stage whose record is written ended: stopped by that record, or by a
 * letter below the run's minimum whatever its judge's verdict, else accepted.
 */
export function endedStatus(stage: MonitoredStage): "accepted" | "stopped" {
	return stage.status === "stopped" ||
		(stage.grade.state === "available" && !stage.grade.reachesMinimum)
		? "stopped"
		: "accepted";
}

async function fetchRunRecord(run: string): Promise<RunRecordResponse> {
	const response = await runRecordRoute.$get({ param: { run } });
	if (!response.ok) {
		throw new Error(`Could not read run ${run}`);
	}

	return response.json();
}

export interface RunRecordQuery {
	readonly queryKey: readonly ["run-record", string];
	readonly queryFn: () => Promise<RunRecordResponse>;
}

/** One pipeline run's record: its stages in pipeline order, with each one's figures. */
export function runRecordQuery(run: string): RunRecordQuery {
	return {
		queryKey: ["run-record", run],
		queryFn: () => fetchRunRecord(run),
	};
}
