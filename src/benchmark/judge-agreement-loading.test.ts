import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadJudgeAgreementReport } from "./judge-agreement";
import {
	CURRENT_BASELINES,
	CURRENT_CALIBRATIONS,
	HISTORICAL_AGREEMENT_REPORT,
	historicalCalibrationFiles,
} from "./judge-agreement-artifact-test-fixtures";

const runsDirectory = join(tmpdir(), `judge-agreement-${randomUUID()}`);
beforeEach(async () => {
	await mkdir(runsDirectory, { recursive: true });
});
afterEach(async () => {
	await rm(runsDirectory, { force: true, recursive: true });
});
async function joinsHistoricalStagesToManifestsAndSkipsUnknownJudgeModels(): Promise<void> {
	await historicalCalibrationFiles(runsDirectory);

	const report = await loadJudgeAgreementReport(runsDirectory);

	expect(report).toMatchObject(HISTORICAL_AGREEMENT_REPORT);
}

async function includesAnUnwrittenCurrentCalibrationExactlyOnce(): Promise<void> {
	const report = await loadJudgeAgreementReport(
		runsDirectory,
		CURRENT_CALIBRATIONS,
	);

	expect(report.baselines).toMatchObject(CURRENT_BASELINES);
}

describe(loadJudgeAgreementReport.name, () => {
	it(
		"joins historical stages to manifests and skips unknown Judge models",
		joinsHistoricalStagesToManifestsAndSkipsUnknownJudgeModels,
	);

	it(
		"includes an unwritten current calibration exactly once",
		includesAnUnwrittenCurrentCalibrationExactlyOnce,
	);
});
