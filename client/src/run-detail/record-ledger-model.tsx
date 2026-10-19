import type { JudgedAnswer, RowEvidence } from "#client/monitor/judged-items";
import type {
	MonitoredStage,
	RunRecordResponse,
} from "#client/monitor/run-record-query";
import {
	judgeLeftWaiting,
	missedMinimum,
} from "#client/monitor/run-record-query";
import type { StageJudgeResponse } from "#client/monitor/stage-judge-query";
import type { StageSessionResponse } from "#client/monitor/stage-session-query";
import type { NodeStatus } from "#client/monitor/task-graph";
import { nodeStatus } from "#client/monitor/task-graph";
import type { PipelineRow } from "#client/shell/run-in-flight";

import { LINE_COUNT } from "./step-report";

/** The stage's judge as the page read it: its answer, still loading, or unreadable. */
type JudgeRead = StageJudgeResponse | "unreadable" | undefined;

/** How long the stage's kept transcript runs, as far as the page has read it. */
function linesReading(
	session: StageSessionResponse | undefined,
	unreadable: boolean,
): readonly string[] {
	if (unreadable) {
		return ["lines not read"];
	}
	if (session === undefined) {
		return [];
	}

	return (session.state === "closed" || session.state === "running") &&
		session.lineCount !== undefined
		? [`${LINE_COUNT.format(session.lineCount)} lines`]
		: ["lines not recorded"];
}

/**
 * The stage's status in the card's words: a stage whose letter fell below the
 * run's minimum says so beside the run stopping on it, and a judge the ended
 * run left waiting reads as never returning.
 */
function cardStatus(
	stage: MonitoredStage,
	row: PipelineRow,
	record: RunRecordResponse,
): NodeStatus {
	if (judgeLeftWaiting(record, stage)) {
		return { state: "interrupted", words: "judge never returned" };
	}

	const status = nodeStatus(stage, row, record);
	const minimum = missedMinimum(record, stage);
	if (status.state !== "stopped" || minimum === undefined) {
		return status;
	}

	return { state: "stopped", words: `below minimum ${minimum} · run stopped` };
}

/** What the stage kept to replay from. */
function checkpointWords(stage: MonitoredStage): string {
	if (stage.checkpoint === "recorded") {
		const name =
			stage.checkpointShortId.state === "available"
				? stage.checkpointShortId.shortId
				: "checkpoint";

		return `${name} · frozen state retained`;
	}

	return "no checkpoint saved";
}

/**
 * Every item the judge cited for the stage, or pending until it answers, which
 * a judge the ended run left waiting never will. An unreadable judge has
 * nothing to count.
 */
function cardEvidence(
	judge: JudgeRead,
	leftWaiting: boolean,
): RowEvidence | undefined {
	if (judge === undefined) {
		return "pending";
	}
	if (judge === "unreadable") {
		return undefined;
	}
	if (judge.state === "judged") {
		return [...judge.hardBlockers, ...judge.dimensions].flatMap(
			({ evidence }) => evidence,
		);
	}

	return judge.state === "not-judged" || leftWaiting ? [] : "pending";
}

function judgedAnswer(judge: JudgeRead): JudgedAnswer | undefined {
	return judge !== undefined &&
		judge !== "unreadable" &&
		judge.state === "judged"
		? judge
		: undefined;
}

interface Unreached {
	readonly stage: MonitoredStage;
	readonly number: number;
}

function stepName({ stage, number }: Unreached): string {
	return `Step ${String(number)} · ${stage.stage}`;
}

export {
	cardEvidence,
	cardStatus,
	checkpointWords,
	judgedAnswer,
	linesReading,
	stepName,
};
export type { JudgeRead, Unreached };
