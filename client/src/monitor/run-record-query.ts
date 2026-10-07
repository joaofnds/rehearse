import type { InferResponseType } from "hono/client";
import { apiClient } from "#client/api-client";

const runRecordRoute = apiClient.api.runs[":run"];

export type RunRecordResponse = InferResponseType<
	typeof runRecordRoute.$get,
	200
>;

export type MonitoredStage = RunRecordResponse["stages"][number];

/** A stage whose record is written: graded, or the one that stopped the run. */
export type EndedStage = MonitoredStage & {
	readonly status: "graded" | "stopped";
};

export function hasEnded(stage: MonitoredStage): stage is EndedStage {
	return stage.status === "graded" || stage.status === "stopped";
}

/**
 * How an ended stage ended: stopped by its record, or by a letter below the
 * run's minimum whatever its judge's verdict, else accepted.
 */
export function endedStatus(stage: EndedStage): "accepted" | "stopped" {
	return stage.status === "stopped" ||
		(stage.grade.state === "available" && !stage.grade.reachesMinimum)
		? "stopped"
		: "accepted";
}

/** Whether a stage's judge will never return: the run ended while it awaited judgment. */
export function judgeLeftWaiting(
	record: RunRecordResponse,
	stage: MonitoredStage,
): boolean {
	return (
		record.finalOutcome.status !== "PENDING" &&
		stage.status === "awaiting-judgment"
	);
}

/** The run's minimum letter that a stage's letter fell below, where both are known. */
export function missedMinimum(
	record: RunRecordResponse,
	stage: MonitoredStage,
): string | undefined {
	const { minimumGrade } = record;

	return minimumGrade.state === "available" &&
		stage.grade.state === "available" &&
		!stage.grade.reachesMinimum
		? minimumGrade.letter
		: undefined;
}

/**
 * A replay starts from the checkpoint the stage before it saved, so a stage
 * whose predecessor saved none has nothing to replay from. The first stage
 * starts from the run's initial checkpoint, which the launch checks.
 */
export function consumedCheckpointMissing(
	record: RunRecordResponse,
	stage: string,
): boolean {
	const index = record.stages.findIndex((each) => each.stage === stage);

	return index > 0 && record.stages[index - 1]?.checkpoint === "missing";
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
