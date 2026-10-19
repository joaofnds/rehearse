import { describe, expect, it } from "bun:test";

import ComparisonAttemptBuilder from "#server/comparison-attempt-test-builder";
import CaseAttemptsBuilder from "#server/comparison-case-attempts-test-builder";

import comparisonSessionAssessment from "./comparison-session-assessment";

const EXPECTED_BOUNDS_PRECISION = 4;

const EXPECTED_BOUNDS_CANDIDATE_LOW_PERCENT = 60.96657;

const EXPECTED_BOUNDS_BASELINE_HIGH_PERCENT = 39.03343;

const STATE_CHECK_FIXTURE_DECLARED = 19;
const PARTIAL_STATE_CHECKS_PASSED = 12;
const NO_STATE_CHECKS = 0;

describe(comparisonSessionAssessment.name, () => {
	it(
		"reports when fewer candidate attempts pass saved state checks",
		verifyComparisonSessionAssessmentNameReportsWhenFewerCandidateAttemptsPassSavedStateChecks,
	);

	it(
		"leaves both layers unavailable when no check assessments were saved",
		verifyComparisonSessionAssessmentNameLeavesBothLayersUnavailableWhenNoCheckAssessmentsWereSaved,
	);

	it(
		"separates saved state success from reply checks and preserves the recorded outcomes",
		verifyComparisonSessionAssessmentNameSeparatesSavedStateSuccessFromReplyChecksAndPreservesTheRecordedOutcomes,
	);

	it(
		"projects observed rates and Wilson confidence bounds for the assessed attempts",
		verifyComparisonSessionAssessmentNameProjectsObservedRatesAndWilsonConfidenceBoundsForTheAssessedAttempts,
	);

	it(
		"keeps absent state measurements outside the assessed denominator",
		verifyComparisonSessionAssessmentNameKeepsAbsentStateMeasurementsOutsideTheAssessedDenominator,
	);

	it(
		"uses reply checks for its headline when no state checks were declared",
		verifyComparisonSessionAssessmentNameUsesReplyChecksForItsHeadlineWhenNoStateChecksWereDeclared,
	);

	it(
		"uses available reply checks while retaining missing state coverage",
		verifyComparisonSessionAssessmentNameUsesAvailableReplyChecksWhileRetainingMissingStateCoverage,
	);

	it(
		"requires every declared check to pass with no recorded failures",
		verifyComparisonSessionAssessmentNameRequiresEveryDeclaredCheckToPassWithNoRecordedFailures,
	);
});

function verifyComparisonSessionAssessmentNameReportsWhenFewerCandidateAttemptsPassSavedStateChecks(): void {
	const passingAttemptBuilder = new ComparisonAttemptBuilder().withStateChecks({
		passed: STATE_CHECK_FIXTURE_DECLARED,
	});
	const attempts = {
		baseline: [passingAttemptBuilder.build(), passingAttemptBuilder.build()],
		candidate: [
			passingAttemptBuilder.build(),
			new ComparisonAttemptBuilder()
				.withStateChecks({ passed: PARTIAL_STATE_CHECKS_PASSED })
				.build(),
		],
		control: [passingAttemptBuilder.build(), passingAttemptBuilder.build()],
	};

	const reading = comparisonSessionAssessment(attempts);

	expect(reading.title).toBe(
		"Candidate passed saved state checks less often in this sample",
	);
	expect(reading.basis).toBe("stateChecks");
}

function verifyComparisonSessionAssessmentNameLeavesBothLayersUnavailableWhenNoCheckAssessmentsWereSaved(): void {
	const missing = {
		...new ComparisonAttemptBuilder()
			.withStateChecks({ passed: NO_STATE_CHECKS })
			.build(),
		checks: undefined,
		stateChecks: undefined,
	};

	const reading = comparisonSessionAssessment({
		baseline: [missing],
		candidate: [missing],
		control: [missing],
	});

	expect(reading.title).toBe("No recorded check assessments to compare");
	expect(reading.basis).toBe("unavailable");
	expect(reading.checks.baseline.passRate).toEqual({ state: "unavailable" });
}

function verifyComparisonSessionAssessmentNameSeparatesSavedStateSuccessFromReplyChecksAndPreservesTheRecordedOutcomes(): void {
	const attempts = new CaseAttemptsBuilder().build();
	const recorded = JSON.stringify(attempts);

	const reading = comparisonSessionAssessment(attempts);

	expect(reading.title).toBe(
		"Candidate passed saved state checks more often in this sample",
	);
	expect(reading.basis).toBe("stateChecks");
	expect(reading.stateChecks.baseline).toMatchObject({
		assessed: 6,
		declared: [STATE_CHECK_FIXTURE_DECLARED],
		missing: 0,
		passed: 0,
		total: 6,
		undeclared: 0,
	});
	expect(reading.stateChecks.candidate).toMatchObject({
		assessed: 6,
		passed: 6,
		total: 6,
	});
	expect(reading.stateChecks.control).toMatchObject({
		assessed: 6,
		passed: 0,
		total: 6,
	});
	expect(reading.checks).toMatchObject({
		baseline: { passed: 6 },
		candidate: { passed: 6 },
		control: { passed: 6 },
	});
	expect(JSON.stringify(attempts)).toBe(recorded);
}

function verifyComparisonSessionAssessmentNameProjectsObservedRatesAndWilsonConfidenceBoundsForTheAssessedAttempts(): void {
	const attempts = new CaseAttemptsBuilder().build();

	const reading = comparisonSessionAssessment(attempts);

	const {
		baseline: { passRate: baseline },
		candidate: { passRate: candidate },
	} = reading.stateChecks;

	expect(baseline).toMatchObject({ low: 0, state: "available", value: 0 });
	expect(candidate).toMatchObject({
		high: 100,
		state: "available",
		value: 100,
	});

	expect(baseline).toHaveProperty(
		"high",
		expect.closeTo(
			EXPECTED_BOUNDS_BASELINE_HIGH_PERCENT,
			EXPECTED_BOUNDS_PRECISION,
		),
	);
	expect(candidate).toHaveProperty(
		"low",
		expect.closeTo(
			EXPECTED_BOUNDS_CANDIDATE_LOW_PERCENT,
			EXPECTED_BOUNDS_PRECISION,
		),
	);
}

function verifyComparisonSessionAssessmentNameKeepsAbsentStateMeasurementsOutsideTheAssessedDenominator(): void {
	const missing = {
		...new ComparisonAttemptBuilder()
			.withStateChecks({ passed: NO_STATE_CHECKS })
			.build(),
		stateChecks: undefined,
	};
	const attempts = {
		...new CaseAttemptsBuilder().build(),
		candidate: [
			new ComparisonAttemptBuilder()
				.withStateChecks({ passed: STATE_CHECK_FIXTURE_DECLARED })
				.build(),
			missing,
		],
	};

	const reading = comparisonSessionAssessment(attempts);

	expect(reading.title).toBe("Saved state comparison has incomplete coverage");
	expect(reading.stateChecks.candidate).toMatchObject({
		assessed: 1,
		declared: [STATE_CHECK_FIXTURE_DECLARED],
		missing: 1,
		passed: 1,
		total: 2,
	});
	expect(reading.stateChecks.candidate.passRate).toMatchObject({
		state: "available",
		value: 100,
	});
}

function verifyComparisonSessionAssessmentNameUsesReplyChecksForItsHeadlineWhenNoStateChecksWereDeclared(): void {
	const attempts = {
		baseline: [
			new ComparisonAttemptBuilder()
				.withStateChecks({ declared: NO_STATE_CHECKS, passed: NO_STATE_CHECKS })
				.build(),
		],
		candidate: [
			new ComparisonAttemptBuilder()
				.withStateChecks({ declared: NO_STATE_CHECKS, passed: NO_STATE_CHECKS })
				.build(),
		],
		control: [
			new ComparisonAttemptBuilder()
				.withStateChecks({ declared: NO_STATE_CHECKS, passed: NO_STATE_CHECKS })
				.build(),
		],
	};

	const reading = comparisonSessionAssessment(attempts);

	expect(reading.title).toBe(
		"No observed difference in reply / transcript pass rates",
	);
	expect(reading.basis).toBe("checks");
	expect(reading.stateChecks.baseline).toEqual({
		assessed: 0,
		declared: [],
		missing: 0,
		passRate: { state: "unavailable" },
		passed: 0,
		total: 1,
		undeclared: 1,
	});
}

function verifyComparisonSessionAssessmentNameUsesAvailableReplyChecksWhileRetainingMissingStateCoverage(): void {
	const missing = {
		...new ComparisonAttemptBuilder()
			.withStateChecks({ passed: NO_STATE_CHECKS })
			.build(),
		stateChecks: undefined,
	};
	const attempts = {
		baseline: [missing],
		candidate: [missing],
		control: [missing],
	};

	const reading = comparisonSessionAssessment(attempts);

	expect(reading.title).toBe(
		"No observed difference in reply / transcript pass rates",
	);
	expect(reading.stateChecks.baseline).toMatchObject({
		assessed: 0,
		missing: 1,
		passRate: { state: "unavailable" },
		total: 1,
		undeclared: 0,
	});
}

function verifyComparisonSessionAssessmentNameRequiresEveryDeclaredCheckToPassWithNoRecordedFailures(): void {
	const inconsistent = {
		...new ComparisonAttemptBuilder()
			.withStateChecks({ passed: STATE_CHECK_FIXTURE_DECLARED })
			.build(),
		stateChecks: {
			declared: 19,
			failing: [{ detail: "history changed", name: "history-preserved" }],
			passed: 19,
		},
	};
	const attempts = {
		...new CaseAttemptsBuilder().build(),
		candidate: [inconsistent],
	};

	const reading = comparisonSessionAssessment(attempts);

	expect(reading.stateChecks.candidate).toMatchObject({
		assessed: 1,
		passed: 0,
	});
}
