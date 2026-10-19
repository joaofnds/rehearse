import { renderAppWithStub } from "#client/test-support/render-app";

import type { CalibrationResponse } from "./calibration-query";

const TOTAL_DIFF_HYGIENE_DRIFT_STEPS = -1;

const DIFF_HYGIENE_REVIEW_COUNT = 3;

const TABLE_HEADER_ROW_COUNT = 1;

const originalFetch = globalThis.fetch;

type AgreementRow = CalibrationResponse["rows"][number];

const RUN = "2026-10-01T10-00-00.000Z";

function reportWith(report: Partial<CalibrationResponse>): CalibrationResponse {
	return {
		groups: [],
		next: null,
		reviews: 0,
		rows: [],
		ungraded: 0,
		withinOneStep: 0,
		...report,
	};
}

function agreementRow(row: Partial<AgreementRow>): AgreementRow {
	return {
		differences: [],
		judgeGrade: "B",
		judgeModel: "opus",
		note: null,
		operatorGrade: "B",
		stage: { kind: "run", run: RUN, stage: "shape" },
		stageName: "shape",
		stepsApart: 0,
		...row,
	};
}

function renderCalibration(report: CalibrationResponse): void {
	renderAppWithStub("/calibration", new Map([["/api/calibration", report]]));
}

function differingGradeReport(): CalibrationResponse {
	return reportWith({
		reviews: 3,
		rows: [
			agreementRow({}),
			agreementRow({
				differences: [{ criterion: "clarity", judge: "A", operator: "B" }],
				judgeGrade: "A",
				stage: { kind: "run", run: RUN, stage: "decompose" },
				stageName: "decompose",
				stepsApart: 1,
			}),
			agreementRow({
				judgeGrade: "D",
				note: "judge accepted an unverified claim",
				stage: { kind: "replay", lineage: "audit", timestamp: RUN },
				stepsApart: 2,
			}),
		],
		withinOneStep: 2,
	});
}

export {
	agreementRow,
	DIFF_HYGIENE_REVIEW_COUNT,
	differingGradeReport,
	originalFetch,
	renderCalibration,
	reportWith,
	RUN,
	TABLE_HEADER_ROW_COUNT,
	TOTAL_DIFF_HYGIENE_DRIFT_STEPS,
};
