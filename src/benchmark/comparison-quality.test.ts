import { describe, expect, it } from "bun:test";

import { buildComparisonQuality } from "./comparison-quality";
import {
	EXPECTED_BASELINE_QUALITY,
	QualityProjections,
} from "./comparison-quality-test-fixtures";

function reportsBaselineReliability(): void {
	const request = QualityProjections.complete();

	const report = buildComparisonQuality(request);
	const [observedFirstCase] = report.cases;

	expect(observedFirstCase?.arms.baseline).toEqual(EXPECTED_BASELINE_QUALITY);
}

function contrastsCandidateAndBaseline(): void {
	const request = QualityProjections.complete();

	const report = buildComparisonQuality(request);
	const [observedFirstQuality] =
		report.contrasts.candidateMinusBaseline.quality;

	expect(observedFirstQuality).toEqual({
		name: "discuss",
		passK: {
			caseDeltas: [
				{ caseId: "case-1", value: 0.9375 },
				{ caseId: "case-2", value: 0.99609375 },
			],
			meanDelta: 0.966796875,
			standardError: 0.029296875,
		},
		successRate: {
			caseDeltas: [
				{ caseId: "case-1", value: 0.5 },
				{ caseId: "case-2", value: 0.75 },
			],
			meanDelta: 0.625,
			standardError: 0.125,
		},
	});
}

function contrastsCandidateAndControl(): void {
	const request = QualityProjections.complete();

	const report = buildComparisonQuality(request);
	const [observedUpdatedFirstQuality] =
		report.contrasts.candidateMinusControl.quality;

	expect(observedUpdatedFirstQuality).toEqual({
		name: "discuss",
		passK: {
			caseDeltas: [
				{ caseId: "case-1", value: 1 },
				{ caseId: "case-2", value: 1 },
			],
			meanDelta: 1,
			standardError: 0,
		},
		successRate: {
			caseDeltas: [
				{ caseId: "case-1", value: 1 },
				{ caseId: "case-2", value: 1 },
			],
			meanDelta: 1,
			standardError: 0,
		},
	});
}

function contrastsBaselineAndControl(): void {
	const request = QualityProjections.complete();

	const report = buildComparisonQuality(request);
	const [observedLaterFirstQuality] =
		report.contrasts.baselineMinusControl.quality;

	expect(observedLaterFirstQuality).toEqual({
		name: "discuss",
		passK: {
			caseDeltas: [
				{ caseId: "case-1", value: 0.0625 },
				{ caseId: "case-2", value: 0.00390625 },
			],
			meanDelta: 0.033203125,
			standardError: 0.029296875,
		},
		successRate: {
			caseDeltas: [
				{ caseId: "case-1", value: 0.5 },
				{ caseId: "case-2", value: 0.25 },
			],
			meanDelta: 0.375,
			standardError: 0.125,
		},
	});
}
describe(buildComparisonQuality.name, () => {
	describe("when comparing two pipeline cases", () => {
		it(
			"reports baseline reliability for every declared stage and final outcome",
			reportsBaselineReliability,
		);
		it(
			"contrasts candidate and baseline quality",
			contrastsCandidateAndBaseline,
		);
		it("contrasts candidate and control quality", contrastsCandidateAndControl);
		it("contrasts baseline and control quality", contrastsBaselineAndControl);
	});
});
