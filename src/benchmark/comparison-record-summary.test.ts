import { describe, expect, it } from "bun:test";

import {
	cancellingComparisonEvidenceFixture,
	flatCaseComparisonEvidenceFixture,
} from "./comparison-case-contrast-test-fixtures";
import buildComparisonReport from "./comparison-report";
import { comparisonEvidenceFixture } from "./comparison-report-test-fixtures";
import { withMissingMetrics } from "./comparison-test-fixtures";
import { comparisonSummary } from "./record-summary";

const PIPELINE_CONFIRMATION_RECORD_VERSION = 1;

const SHA256_HEX_DIGITS = 64;

function rendersEveryPairedDeltaBesideTheContrastAgainstTheControlArm(): void {
	const report = buildComparisonReport(comparisonEvidenceFixture(), {
		baselines: [],
		skippedCalibrations: 0,
	});

	expect(comparisonSummary("c".repeat(SHA256_HEX_DIGITS), report)).toBe(
		`## comparison:${"c".repeat(SHA256_HEX_DIGITS)}

2 cases, pipeline mode, 4 reps.

| contrast | outcome | success rate Δ | standard error | pass^k Δ | per-case Δ | reading |
| --- | --- | --- | --- | --- | --- | --- |
| candidate − baseline | discuss | +0.500 | 0.000 | +0.938 | case-1 +0.500, case-2 +0.500 |  |
| candidate − baseline | build | +0.500 | 0.000 | +0.938 | case-1 +0.500, case-2 +0.500 |  |
| candidate − baseline | final | +0.500 | 0.000 | +0.938 | case-1 +0.500, case-2 +0.500 |  |
| candidate − control | discuss | +1.000 | 0.000 | +1.000 | case-1 +1.000, case-2 +1.000 |  |
| candidate − control | build | +1.000 | 0.000 | +1.000 | case-1 +1.000, case-2 +1.000 |  |
| candidate − control | final | +1.000 | 0.000 | +1.000 | case-1 +1.000, case-2 +1.000 |  |
| baseline − control | discuss | +0.500 | 0.000 | +0.063 | case-1 +0.500, case-2 +0.500 |  |
| baseline − control | build | +0.500 | 0.000 | +0.063 | case-1 +0.500, case-2 +0.500 |  |
| baseline − control | final | +0.500 | 0.000 | +0.063 | case-1 +0.500, case-2 +0.500 |  |

| contrast | cost Δ (USD) | standard error | per-case Δ |
| --- | --- | --- | --- |
| candidate − baseline | +0.000000 | 0.000000 | case-1 +0.000000, case-2 +0.000000 |
| candidate − control | +0.000000 | 0.000000 | case-1 +0.000000, case-2 +0.000000 |
| baseline − control | +0.000000 | 0.000000 | case-1 +0.000000, case-2 +0.000000 |
`,
	);
}

function namesTheDisagreementWhenPerCaseDeltasCancelToAZeroMean(): void {
	const report = buildComparisonReport(cancellingComparisonEvidenceFixture(), {
		baselines: [],
		skippedCalibrations: 0,
	});

	const summary = comparisonSummary("c".repeat(SHA256_HEX_DIGITS), report);

	// The mean alone is +0.000 here, identical to two cases that did not
	// move. The per-case deltas and the reading are what separate them.
	expect(summary).toContain(
		"| candidate − baseline | discuss | +0.000 | 0.500 | +0.000 | case-1 +0.500, case-2 -0.500 | cases disagree |",
	);
}

function rendersACostTableWhoseStandardErrorReflectsThePerCaseSpread(): void {
	const report = buildComparisonReport(cancellingComparisonEvidenceFixture(), {
		baselines: [],
		skippedCalibrations: 0,
	});

	const summary = comparisonSummary("c".repeat(SHA256_HEX_DIGITS), report);

	// The mean and its standard error both reach the rendered row. These
	// fixture costs are whole-dollar scale, so this pins the figures and
	// the six-decimal format, not the sub-cent regime that format exists
	// for; the live report 511cd2c4 is the evidence for that regime.
	expect(summary).toContain(
		"| candidate − baseline | +3.750000 | 1.250000 | case-1 +5.000000, case-2 +2.500000 |",
	);
	expect(summary).toContain(
		"| candidate − control | -1.250000 | 3.750000 | case-1 +2.500000, case-2 -5.000000 |",
	);
}

function reportsAnUnavailableCostRowRatherThanAZeroDelta(): void {
	const evidence = cancellingComparisonEvidenceFixture();
	const [benchmarkCase, ...otherCases] = evidence.cases;
	if (benchmarkCase === undefined) {
		throw new Error("the fixture carries no case");
	}
	const [firstRep, ...otherReps] = benchmarkCase.arms.candidate.reps;
	if (firstRep?.record.schemaVersion !== PIPELINE_CONFIRMATION_RECORD_VERSION) {
		throw new Error("the candidate arm carries no pipeline rep");
	}

	const report = buildComparisonReport(
		{
			...evidence,
			cases: [
				{
					...benchmarkCase,
					arms: {
						...benchmarkCase.arms,
						candidate: {
							...benchmarkCase.arms.candidate,
							reps: [
								{
									...firstRep,
									record: withMissingMetrics(
										firstRep.record,
										"worker call metrics",
									),
								},
								...otherReps,
							],
						},
					},
				},
				...otherCases,
			],
		},
		{ baselines: [], skippedCalibrations: 0 },
	);

	const summary = comparisonSummary("c".repeat(SHA256_HEX_DIGITS), report);

	// A missing measurement must not read as "this edit cost nothing".
	expect(summary).toContain(
		"| candidate − baseline | unavailable | unavailable | unavailable |",
	);
}

function readsACaseThatDidNotMoveAsAgreementNotDisagreement(): void {
	const report = buildComparisonReport(flatCaseComparisonEvidenceFixture(), {
		baselines: [],
		skippedCalibrations: 0,
	});

	const summary = comparisonSummary("c".repeat(SHA256_HEX_DIGITS), report);

	// Case-2's delta is exactly 0.000 beside a positive case. Reading this
	// as a disagreement would mean a case that did not move counts as
	// conflict, which is what relaxing the negative comparison to <= does.
	expect(summary).toContain("case-1 +0.500, case-2 +0.000");
	expect(summary).not.toContain("cases disagree");

	// The mirror, so that relaxing the POSITIVE comparison to >= is caught
	// as well: the same zero beside a negative delta. Without this row only
	// one side of caseDeltasDisagree is pinned.
	expect(summary).toContain("case-1 -0.500, case-2 +0.000");
}

function leavesTheReadingBlankWhenEveryPerCaseDeltaSharesASign(): void {
	const report = buildComparisonReport(comparisonEvidenceFixture(), {
		baselines: [],
		skippedCalibrations: 0,
	});

	const summary = comparisonSummary("c".repeat(SHA256_HEX_DIGITS), report);

	expect(summary).not.toContain("cases disagree");
	expect(summary).toContain(
		"| candidate − baseline | discuss | +0.500 | 0.000 | +0.938 | case-1 +0.500, case-2 +0.500 |  |",
	);
}

describe(comparisonSummary.name, () => {
	it(
		"renders every paired delta beside the contrast against the control arm",
		rendersEveryPairedDeltaBesideTheContrastAgainstTheControlArm,
	);
	it(
		"names the disagreement when per-case deltas cancel to a zero mean",
		namesTheDisagreementWhenPerCaseDeltasCancelToAZeroMean,
	);
	it(
		"renders a cost table whose standard error reflects the per-case spread",
		rendersACostTableWhoseStandardErrorReflectsThePerCaseSpread,
	);
	it(
		"reports an unavailable cost row rather than a zero delta",
		reportsAnUnavailableCostRowRatherThanAZeroDelta,
	);
	it(
		"reads a case that did not move as agreement, not disagreement",
		readsACaseThatDidNotMoveAsAgreementNotDisagreement,
	);
	it(
		"leaves the reading blank when every per-case delta shares a sign",
		leavesTheReadingBlankWhenEveryPerCaseDeltaSharesASign,
	);
});
