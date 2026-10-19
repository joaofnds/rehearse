import { calibratedRecordJson } from "#benchmark/calibration-record-json";
import type { CalibrationResult } from "#benchmark/contracts";
import { loadJudgeAgreementReport } from "#benchmark/judge-agreement";
import { completeRunArtifact } from "#benchmark/run-artifact";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import type { CommandOutput } from "#cli/output";
import RECORD_JSON_INDENT_SPACES from "#server/json-record-format";

import type { CalibratableRecord } from "./calibration-input-record";
import { agreementInput } from "./calibration-record-evidence";

const EMPTY_COLLECTION_LENGTH = 0;

function rejudged(calibration: Readonly<CalibrationResult>): boolean {
	return (
		calibration.revisedGrade !== undefined ||
		(calibration.revisedStageScorecards?.length ?? EMPTY_COLLECTION_LENGTH) >
			EMPTY_COLLECTION_LENGTH
	);
}

function revisedGrades(calibration: Readonly<CalibrationResult>): string {
	return JSON.stringify(
		{
			revisedGrade: calibration.revisedGrade,
			revisedStageGrades: calibration.revisedStageScorecards?.map(
				({ stage, grade }) => ({ grade, stage }),
			),
		},
		null,
		RECORD_JSON_INDENT_SPACES,
	);
}

interface CalibrationCompletion {
	readonly calibration: CalibrationResult;
	readonly confirmRejudge: boolean;
	readonly record: CalibratableRecord;
	readonly run: string;
	readonly runsDirectory: string;
}

async function completeCalibration(
	request: CalibrationCompletion,
	output: CommandOutput,
): Promise<void> {
	const { calibration, confirmRejudge, record, run, runsDirectory } = request;
	if (rejudged(calibration) && !confirmRejudge) {
		output.stderr(`${revisedGrades(calibration)}\n`);
		throw new RefusedPreconditionError(
			`The rejudge revised the grades above; re-run with --confirm-rejudge to record them for run ${run}. That rejudge runs again, against the rubrics as they stand then.`,
		);
	}

	const judgeAgreement = await loadJudgeAgreementReport(runsDirectory, [
		agreementInput(record, calibration),
	]);
	const completed =
		record.kind === "final"
			? completeRunArtifact(record.record, calibration, judgeAgreement)
			: { ...record.record, calibration, judgeAgreement };
	await Bun.write(
		record.file,
		calibratedRecordJson({
			json: JSON.stringify(completed),
			kind: record.kind,
		}),
	);
}

export { completeCalibration as default };
