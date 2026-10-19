import { afterEach, describe, expect, it } from "bun:test";

import { parseComparisonReport } from "#benchmark/comparison-record";
import buildComparisonReport from "#benchmark/comparison-report";
import { comparisonEvidenceFixture } from "#benchmark/comparison-report-test-fixtures";
import {
	clearComparisonRoots,
	oneCheckpointReportText,
} from "#server/comparison-endpoint-test-fixture";
import ComparisonSourceRepBuilder from "#server/comparison-source-rep-test-builder";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

import { comparisonAttempts } from "./comparison-attempts";

const SCORED_SOURCE_REP = new ComparisonSourceRepBuilder({
	attempt: undefined,
	group: 0,
	ordinal: 1,
	outcomes: [
		{ grade: "A", name: "discuss", status: "JUDGED", successful: true },
		{ grade: "A", name: "build", status: "JUDGED", successful: true },
		{ grade: "PASS", name: "final", status: "JUDGED", successful: true },
	],
	path: "groups/case-1-baseline/reps/case-1-baseline-rep-1/rep.json",
	repId: "case-1-baseline-rep-1",
	sha256: "7".repeat(SHA256_HEX_DIGITS),
}).build();

afterEach(clearComparisonRoots);

function onlyCase(
	report: ReturnType<typeof parseComparisonReport>,
): ReturnType<typeof parseComparisonReport>["cases"][number] {
	const [benchmarkCase] = report.cases;
	if (benchmarkCase === undefined) {
		throw new Error("the report holds no case");
	}

	return benchmarkCase;
}

describe(comparisonAttempts.name, () => {
	it(
		"lists each arm's attempts by ordinal with the grade, blockers fired and words each recorded",
		verifyComparisonAttemptsNameListsEachArmSAttemptsByOrdinalWithTheGradeBlockersFiredAndWordsEachRecorded,
	);

	it(
		"preserves reply and state check scores separately from the recorded outcome",
		verifyComparisonAttemptsNamePreservesReplyAndStateCheckScoresSeparatelyFromTheRecordedOutcome,
	);

	it(
		"reads unavailable, never an attempt nothing fired on, for reps their report recorded no grading or words for",
		verifyComparisonAttemptsNameReadsUnavailableNeverAnAttemptNothingFiredOnForRepsTheirReportRecordedNoGradingOrWordsFor,
	);
});

async function verifyComparisonAttemptsNameListsEachArmSAttemptsByOrdinalWithTheGradeBlockersFiredAndWordsEachRecorded(): Promise<void> {
	const report = parseComparisonReport(await oneCheckpointReportText());

	const attempts = comparisonAttempts(onlyCase(report));

	const [observedFirstCandidate] = attempts.candidate;

	expect(attempts.baseline).toEqual([
		{
			blockersFired: {
				blockers: [{ id: "scope-declared", stage: "build" }],
				state: "available",
			},
			ordinal: 1,
			outcomes: {
				outcomes: [
					{ grade: "A", name: "build", status: "JUDGED", successful: true },
				],
				state: "available",
			},
			repId: "build-checkpoint-baseline-rep-1",
			words: { state: "available", words: 7 },
		},
		{
			blockersFired: {
				blockers: [{ id: "scope-declared", stage: "build" }],
				state: "available",
			},
			ordinal: 2,
			outcomes: {
				outcomes: [
					{ grade: "A", name: "build", status: "JUDGED", successful: true },
				],
				state: "available",
			},
			repId: "build-checkpoint-baseline-rep-2",
			words: { state: "available", words: 8 },
		},
	]);
	expect(observedFirstCandidate?.blockersFired).toEqual({
		blockers: [],
		state: "available",
	});
}

function verifyComparisonAttemptsNamePreservesReplyAndStateCheckScoresSeparatelyFromTheRecordedOutcome(): void {
	const report = buildComparisonReport(comparisonEvidenceFixture(), {
		baselines: [],
		skippedCalibrations: 0,
	});
	const benchmarkCase = onlyCase(report);
	const { baseline } = benchmarkCase.arms;

	const scored = {
		...benchmarkCase,
		arms: {
			...benchmarkCase.arms,
			baseline: {
				...baseline,
				source: {
					...baseline.source,
					reps: [
						{
							...SCORED_SOURCE_REP,
							checks: { declared: 1, failing: [], passed: 1 },
							stateResults: {
								declared: 1,
								failing: [
									{ detail: "history changed", name: "history-preserved" },
								],
								passed: 0,
							},
						},
					],
				},
			},
		},
	};

	const [attempt] = comparisonAttempts(scored).baseline;

	expect(attempt?.checks).toEqual({ declared: 1, failing: [], passed: 1 });
	expect(attempt?.stateChecks).toEqual({
		declared: 1,
		failing: [{ detail: "history changed", name: "history-preserved" }],
		passed: 0,
	});
}

function verifyComparisonAttemptsNameReadsUnavailableNeverAnAttemptNothingFiredOnForRepsTheirReportRecordedNoGradingOrWordsFor(): void {
	const report = buildComparisonReport(comparisonEvidenceFixture(), {
		baselines: [],
		skippedCalibrations: 0,
	});

	const [attempt] = comparisonAttempts(onlyCase(report)).control;

	expect(attempt?.blockersFired.state).toBe("unavailable");
	expect(attempt?.words.state).toBe("unavailable");
}
