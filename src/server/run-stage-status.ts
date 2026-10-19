import type { StageStatus } from "#server/run-record-contract";
import type { StageFile } from "#server/run-stage-file";

function stageStatus(file: StageFile | undefined): StageStatus {
	if (file === undefined) {
		return "no-record";
	}

	if (file.status === "STAGE_JUDGE_FAILED") {
		return "stopped";
	}

	if (file.status === "AWAITING_STAGE_JUDGE") {
		return "awaiting-judgment";
	}

	return "graded";
}

export { stageStatus as default };
