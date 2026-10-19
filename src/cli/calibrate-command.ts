import { writeRecord } from "#cli/output";

import completeCalibration from "./calibration-completion";
import type { CalibrateDependencies } from "./calibration-rejudging";
import rejudgeCalibration from "./calibration-rejudging";
import type { CalibrationInputRequest } from "./calibration-session-input";
import loadCalibrationInputs from "./calibration-session-input";

interface CalibrateRequest extends CalibrationInputRequest {
	readonly json: boolean;
	readonly confirmRejudge: boolean;
}

async function runCalibrate(
	request: Readonly<CalibrateRequest>,
	dependencies: Readonly<CalibrateDependencies>,
): Promise<void> {
	const { buildJudges, output, probeModel, requireSpendCeiling } = dependencies;
	const input = await loadCalibrationInputs(request);

	const calibration = await rejudgeCalibration(
		{ input, runsDirectory: request.runsDirectory },
		{ buildJudges, output, probeModel, requireSpendCeiling },
	);

	await completeCalibration(
		{
			calibration,
			confirmRejudge: request.confirmRejudge,
			record: input.record,
			run: input.run,
			runsDirectory: request.runsDirectory,
		},
		output,
	);

	await writeRecord(output, input.record.file, request.json);
}

export { readControlSources } from "./calibration-current-sources";

export { default as judgesFor } from "./calibration-judges";

export type { CurrentControlSources } from "./calibration-current-sources";

export type { CalibrateJudges, JudgeKnobs } from "./calibration-judges";

export type { CalibrateDependencies } from "./calibration-rejudging";

export { runCalibrate };

export type { CalibrateRequest };
