import { useQuery } from "@tanstack/react-query";

import type { JudgedAnswer } from "#client/monitor/judged-items";
import { judgeLeftWaiting } from "#client/monitor/run-record-query";
import { stageJudgeQuery } from "#client/monitor/stage-judge-query";
import { stageSessionQuery } from "#client/monitor/stage-session-query";
import type { NodeStatus } from "#client/monitor/task-graph";
import { costReading, durationReading } from "#client/monitor/task-graph";

import type { LedgerCardProps } from "./record-ledger-card";
import type { FullSessionProps } from "./record-ledger-evidence";
import type { JudgeRead } from "./record-ledger-model";
import { cardStatus, judgedAnswer, linesReading } from "./record-ledger-model";

interface LedgerCardReadings {
	readonly status: NodeStatus;
	readonly judgeRead: JudgeRead;
	readonly judged: JudgedAnswer | undefined;
	readonly leftWaiting: boolean;
	readonly meta: string;
	readonly session: FullSessionProps["session"];
}

function useLedgerCardReadings({
	row,
	record,
	stage,
	nowMs,
}: LedgerCardReadingRequest): LedgerCardReadings {
	const session = useQuery(stageSessionQuery(row.run, stage.stage));
	const judge = useQuery(stageJudgeQuery(row.run, stage.stage));

	const status = cardStatus(stage, row, record);
	const leftWaiting = judgeLeftWaiting(record, stage);
	const judgeRead: JudgeRead = judge.isError ? "unreadable" : judge.data;
	const judged = judgedAnswer(judgeRead);
	const meta = [
		durationReading(stage, row, nowMs),
		costReading(stage, row),
		...linesReading(session.data, session.isError),
	].join(" · ");

	return {
		judgeRead,
		judged,
		leftWaiting,
		meta,
		session: session.isError ? "unreadable" : session.data,
		status,
	};
}

type LedgerCardReadingRequest = Pick<
	LedgerCardProps,
	"row" | "record" | "stage" | "nowMs"
>;

export { useLedgerCardReadings as default };
