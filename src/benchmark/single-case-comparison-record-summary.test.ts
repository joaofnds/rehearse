import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import type { ComparisonEvidence } from "./comparison-evidence";
import { parseComparisonReport } from "./comparison-record";
import buildComparisonReport from "./comparison-report";
import {
	singleCaseSessionEvidenceFixture,
	withMissingSessionMetrics,
} from "./comparison-session-test-fixtures";
import type { Immutable } from "./contracts";
import { comparisonSummary } from "./record-summary";

const SESSION_CONFIRMATION_RECORD_VERSION = 2;
const RESOURCE_SUMMARY_COMPARISON_REPORT_VERSION = 4;

const SHA256_HEX_DIGITS = 64;
function withMissingCandidateMetrics(
	evidence: Immutable<ComparisonEvidence>,
): ComparisonEvidence {
	const [benchmarkCase] = evidence.cases;
	if (benchmarkCase === undefined) {
		throw new Error("the fixture carries no case");
	}
	const [first, ...rest] = benchmarkCase.arms.candidate.reps;
	if (first?.record.schemaVersion !== SESSION_CONFIRMATION_RECORD_VERSION) {
		throw new Error("the candidate arm carries no session rep");
	}

	return {
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
								...first,
								record: withMissingSessionMetrics(
									first.record,
									"worker call metrics",
								),
							},
							...rest,
						],
					},
				},
			},
		],
	};
}
const JUDGE_AGREEMENT = { baselines: [], skippedCalibrations: 0 } as const;

function namesItsElapsedFigureAsPerAttemptBesideTheCostDelta(): void {
	const report = buildComparisonReport(
		singleCaseSessionEvidenceFixture({
			baseline: [
				{ costUsd: 0.02, elapsedMs: 1000 },
				{ costUsd: 0.02, elapsedMs: 3000 },
			],
			candidate: [
				{ costUsd: 0.02, elapsedMs: 5000 },
				{ costUsd: 0.02, elapsedMs: 7000 },
			],
			control: [
				{ costUsd: 0.02, elapsedMs: 1000 },
				{ costUsd: 0.02, elapsedMs: 3000 },
			],
		}),
		JUDGE_AGREEMENT,
	);

	expect(comparisonSummary("d".repeat(SHA256_HEX_DIGITS), report)).toBe(
		`## comparison:${"d".repeat(SHA256_HEX_DIGITS)}

1 case, session mode, 2 reps.

Sampling unit: rep. Arms are independent samples; this estimate covers case case-one only.

| arm | successful | success rate | 95% interval | pass^k |
| --- | --- | --- | --- | --- |
| baseline | 2/2 | 1.000 | 0.342-1.000 | 1.000 |
| candidate | 2/2 | 1.000 | 0.342-1.000 | 1.000 |
| control | 2/2 | 1.000 | 0.342-1.000 | 1.000 |

| contrast | outcome | success rate Δ | standard error | pass^k Δ |
| --- | --- | --- | --- | --- |
| candidate − baseline | checks | +0.000 | 0.000 | +0.000 |
| candidate − control | checks | +0.000 | 0.000 | +0.000 |
| baseline − control | checks | +0.000 | 0.000 | +0.000 |

| contrast | cost Δ | standard error | per-attempt elapsed Δ (ms) | standard error |
| --- | --- | --- | --- | --- |
| candidate − baseline | +0.000 | no observed spread | +4000.000 | 1414.214 |
| candidate − control | +0.000 | no observed spread | +4000.000 | 1414.214 |
| baseline − control | +0.000 | no observed spread | +0.000 | 1414.214 |
`,
	);
}

async function reportsElapsedAsUnavailableForAReportSavedBeforeVersion5(): Promise<void> {
	const legacy = parseComparisonReport(
		await Bun.file(
			join(import.meta.dir, "fixtures", "version-four-single-case-report.json"),
		).text(),
	);
	if (
		legacy.schemaVersion !== RESOURCE_SUMMARY_COMPARISON_REPORT_VERSION ||
		!("samplingUnit" in legacy)
	) {
		throw new Error("expected a single-case version-four report");
	}

	const summary = comparisonSummary("e".repeat(SHA256_HEX_DIGITS), legacy);

	expect(summary).toContain(
		"| candidate − baseline | +0.000 | no observed spread | unavailable | unavailable |",
	);
	expect(summary).not.toContain("no observed spread | +0.000");
}

function reportsElapsedAsUnavailableForAnArmWhoseRepMetricsAreMissing(): void {
	const evidence = singleCaseSessionEvidenceFixture({
		baseline: [
			{ costUsd: 0.02, elapsedMs: 1000 },
			{ costUsd: 0.02, elapsedMs: 3000 },
		],
		candidate: [
			{ costUsd: 0.02, elapsedMs: 5000 },
			{ costUsd: 0.02, elapsedMs: 7000 },
		],
		control: [
			{ costUsd: 0.02, elapsedMs: 1000 },
			{ costUsd: 0.02, elapsedMs: 3000 },
		],
	});
	const report = buildComparisonReport(
		withMissingCandidateMetrics(evidence),
		JUDGE_AGREEMENT,
	);
	const [benchmarkCase] = report.cases;

	expect(benchmarkCase?.arms.candidate.resources).toMatchObject({
		missingMetricReps: 1,
		status: "UNAVAILABLE",
	});
	expect(comparisonSummary("f".repeat(SHA256_HEX_DIGITS), report)).toContain(
		"| candidate − baseline | unavailable | unavailable | unavailable | unavailable |",
	);
}

describe(`${comparisonSummary.name} for a single case`, () => {
	it(
		"names its elapsed figure as per-attempt beside the cost delta",
		namesItsElapsedFigureAsPerAttemptBesideTheCostDelta,
	);
	it(
		"reports elapsed as unavailable for a report saved before version 5",
		reportsElapsedAsUnavailableForAReportSavedBeforeVersion5,
	);
	it(
		"reports elapsed as unavailable for an arm whose rep metrics are missing",
		reportsElapsedAsUnavailableForAnArmWhoseRepMetricsAreMissing,
	);
});
