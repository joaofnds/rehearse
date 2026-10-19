import type { StageLetterGrade } from "#benchmark/contracts";
import { operatorStageLetter } from "#benchmark/operator-grade";
import type { GradedStageRef, OperatorGrade } from "#benchmark/operator-grade";
import { CalibrationRefusalError } from "#server/calibration-contract";
import { HTTP_STATUS_BAD_REQUEST } from "#server/http-status";
import {
	SessionHistoryReaderError,
	parseIdentity,
} from "#server/session-history-reader";

interface RunStageParams {
	readonly run: string;
	readonly stage: string;
}

function runStageRef(params: RunStageParams): GradedStageRef {
	return {
		kind: "run",
		run: confined(params.run),
		stage: confined(params.stage),
	};
}

interface RepStageParams {
	readonly groupId: string;
	readonly repId: string;
	readonly stage: string;
}

function repStageRef(params: RepStageParams): GradedStageRef {
	return {
		groupId: confined(params.groupId),
		kind: "rep",
		repId: confined(params.repId),
		stage: confined(params.stage),
	};
}

interface ReplayStageParams {
	readonly lineage: string;
	readonly timestamp: string;
}

function replayStageRef(params: ReplayStageParams): GradedStageRef {
	return {
		kind: "replay",
		lineage: confined(params.lineage),
		timestamp: confined(params.timestamp),
	};
}

function gradedLetter(grade: OperatorGrade): OperatorGrade & {
	readonly grade: StageLetterGrade;
} {
	return { ...grade, grade: operatorStageLetter(grade) };
}

function confined(value: string): string {
	try {
		return parseIdentity(value);
	} catch (error) {
		if (!(error instanceof SessionHistoryReaderError)) {
			throw error;
		}

		throw new CalibrationRefusalError(
			HTTP_STATUS_BAD_REQUEST,
			`${value} names no recorded stage`,
		);
	}
}

export { runStageRef, repStageRef, replayStageRef, gradedLetter };
