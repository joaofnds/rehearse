import type {
	CurrentCalibrationSources,
	FrozenCalibrationEvidence,
} from "#benchmark/calibration";
import type { HumanReview } from "#benchmark/contracts";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import { UsageError } from "#cli/command-usage";
import { parseRunRecordId } from "#cli/record-id";

import type { CalibrationSourceRequest } from "./calibration-current-sources";
import { currentSources } from "./calibration-current-sources";
import type { CalibratableRecord } from "./calibration-input-record";
import loadRecord from "./calibration-input-record";
import { frozenEvidence, recordedCaseId } from "./calibration-record-evidence";
import { readReview } from "./calibration-record-read";

interface CalibrationInputRequest extends CalibrationSourceRequest {
	readonly id: string | undefined;
	readonly runsDirectory: string;
}

interface CalibrationInputs {
	readonly run: string;
	readonly record: CalibratableRecord;
	readonly review: HumanReview;
	readonly frozen: FrozenCalibrationEvidence;
	readonly current: CurrentCalibrationSources;
}

async function loadCalibrationInputs(
	request: Readonly<CalibrationInputRequest>,
): Promise<CalibrationInputs> {
	if (request.id === undefined) {
		throw new UsageError("Provide the run: rehearse calibrate <run:name|name>");
	}

	const { run } = parseRunRecordId(request.id);
	const record = await loadRecord(request.runsDirectory, run);
	const paths = benchmarkRunPaths(request.runsDirectory, run);
	const review = await readReview(paths.reviewFile);
	const frozen = frozenEvidence(record);
	const current = await currentSources({
		caseId: recordedCaseId(record),
		frozen,
		readCurrentSources: request.readCurrentSources,
	});

	return { current, frozen, record, review, run };
}

export { loadCalibrationInputs as default };

export type { CalibrationInputRequest, CalibrationInputs };
