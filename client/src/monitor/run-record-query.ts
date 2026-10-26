import type { InferResponseType } from "hono/client";

import { apiClient } from "#client/api-client";
import type HTTP_STATUS from "#client/http-status";

const INITIAL_RECORDED_STAGE_INDEX = 0;

const FIRST_STAGE_INDEX = 0;

const PREVIOUS_ELEMENT_OFFSET = 1;

/** The name the server gives the checkpoint a run's first stage starts from. */
const INITIAL_CHECKPOINT = "initial";

/** The prefix every run record's query key starts with. */
const RUN_RECORDS_KEY = ["run-record"] as const;

const runRecordRoute = apiClient.api.runs[":run"];

type RunRecordResponse = InferResponseType<
	typeof runRecordRoute.$get,
	typeof HTTP_STATUS.ok
>;

type MonitoredStage = RunRecordResponse["stages"][number];

/** A stage whose record is written: graded, or the one that stopped the run. */
type EndedStage = MonitoredStage & {
	readonly status: "graded" | "stopped";
};

function hasEnded(stage: MonitoredStage): stage is EndedStage {
	return stage.status === "graded" || stage.status === "stopped";
}

/**
 * How an ended stage ended: stopped by its record, or by a letter below the
 * run's minimum whatever its judge's verdict, else accepted.
 */
function endedStatus(stage: EndedStage): "accepted" | "stopped" {
	return stage.status === "stopped" ||
		(stage.grade.state === "available" && !stage.grade.reachesMinimum)
		? "stopped"
		: "accepted";
}

function continuationReading(
	minimum: RunRecordResponse["minimumGrade"] | undefined,
): string {
	return minimum?.state === "available"
		? `Continued at minimum ${minimum.letter}`
		: "Continued · minimum unavailable";
}

/** Whether a stage's judge will never return: the run ended while it awaited judgment. */
function judgeLeftWaiting(
	record: RunRecordResponse,
	stage: MonitoredStage,
): boolean {
	return (
		record.finalOutcome.status !== "PENDING" &&
		stage.status === "awaiting-judgment"
	);
}

/** The run's minimum letter that a stage's letter fell below, where both are known. */
function missedMinimum(
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

type ConsumedCheckpoint = Extract<
	MonitoredStage["artifactsIn"]["entries"][number],
	{ readonly from: "upstream checkpoint" }
>;

/** The checkpoint a stage's session started from, where its record names one. */
function consumedCheckpoint(
	stage: MonitoredStage,
): ConsumedCheckpoint | undefined {
	return stage.artifactsIn.entries.find(
		(entry): entry is ConsumedCheckpoint =>
			entry.from === "upstream checkpoint",
	);
}

/**
 * A replay starts from the checkpoint the stage before it saved, so a stage
 * whose predecessor saved none has nothing to replay from. The first stage
 * starts from the run's initial checkpoint, which the launch checks.
 */
function consumedCheckpointMissing(
	record: RunRecordResponse,
	stage: string,
): boolean {
	const index = record.stages.findIndex((each) => each.stage === stage);

	return (
		index > FIRST_STAGE_INDEX &&
		record.stages[index - PREVIOUS_ELEMENT_OFFSET]?.checkpoint === "missing"
	);
}

function stageReplayRefusal(
	record: RunRecordResponse,
	name: string,
): string | undefined {
	const stage = record.stages.find((each) => each.stage === name);
	if (stage === undefined || !hasEnded(stage)) {
		return `${name} has no completed step record to replay`;
	}
	if (record.finalOutcome.status === "PENDING") {
		return "Wait for the source run to end before replaying a step";
	}
	if (consumedCheckpointMissing(record, name)) {
		return `${name} has no checkpoint to replay from`;
	}
	if (
		record.stages[INITIAL_RECORDED_STAGE_INDEX]?.stage === name &&
		!stage.artifactsIn.entries.some(
			(entry) =>
				entry.from === "upstream checkpoint" &&
				entry.upstream === INITIAL_CHECKPOINT,
		)
	) {
		return "The initial checkpoint is not retained for this step";
	}

	return undefined;
}

async function fetchRunRecord(run: string): Promise<RunRecordResponse> {
	const response = await runRecordRoute.$get({ param: { run } });
	if (!response.ok) {
		throw new Error(`Could not read run ${run}`);
	}

	return await response.json();
}

interface RunRecordQuery {
	readonly queryKey: readonly ["run-record", string];
	readonly queryFn: () => Promise<RunRecordResponse>;
}

/** One pipeline run's record: its stages in pipeline order, with each one's figures. */
function runRecordQuery(run: string): RunRecordQuery {
	return {
		queryFn: async () => await fetchRunRecord(run),
		queryKey: [...RUN_RECORDS_KEY, run],
	};
}

export {
	INITIAL_CHECKPOINT,
	RUN_RECORDS_KEY,
	consumedCheckpoint,
	consumedCheckpointMissing,
	continuationReading,
	endedStatus,
	hasEnded,
	judgeLeftWaiting,
	missedMinimum,
	runRecordQuery,
	stageReplayRefusal,
};
export type {
	ConsumedCheckpoint,
	EndedStage,
	MonitoredStage,
	RunRecordQuery,
	RunRecordResponse,
};
