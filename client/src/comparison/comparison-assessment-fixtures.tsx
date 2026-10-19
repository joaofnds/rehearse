import type { CaseAttempts } from "#server/comparison-attempts";
import type { SessionComparisonAssessment } from "#server/comparison-session-assessment";

import type { ComparisonResponseFixture } from "./comparison-page-test-fixtures";
import {
	DECLARED_REPLY_CHECK_COUNT,
	DECLARED_STATE_CHECK_COUNT,
	comparisonResponseBody,
} from "./comparison-page-test-fixtures";
import {
	ONE_EQUAL_COMBINATION,
	PASSED,
	caseSummary,
} from "./comparison-report-test-fixtures";

function sessionAssessmentLayers(): SessionComparisonAssessment {
	const failedState: SessionComparisonAssessment["stateChecks"]["baseline"] = {
		assessed: 6,
		declared: [DECLARED_STATE_CHECK_COUNT],
		missing: 0,
		passRate: { high: 39.03343, low: 0, state: "available", value: 0 },
		passed: 0,
		total: 6,
		undeclared: 0,
	};
	const passedReply: SessionComparisonAssessment["checks"]["baseline"] = {
		...failedState,
		declared: [DECLARED_REPLY_CHECK_COUNT],
		passRate: { high: 100, low: 60.96657, state: "available", value: 100 },
		passed: 6,
	};
	return {
		basis: "stateChecks",
		checks: {
			baseline: passedReply,
			candidate: passedReply,
			control: passedReply,
		},
		stateChecks: {
			baseline: failedState,
			candidate: {
				...passedReply,
				declared: [DECLARED_STATE_CHECK_COUNT],
			},
			control: failedState,
		},
		title: "Candidate passed saved state checks more often in this sample",
	};
}

function sessionAssessmentAttempts(): CaseAttempts {
	const failedAttempt = {
		...PASSED,
		checks: { declared: 1, failing: [], passed: 1 },
		stateChecks: {
			declared: 19,
			failing: [{ detail: "history changed", name: "history-preserved" }],
			passed: 12,
		},
	};
	const passedAttempt = {
		...failedAttempt,
		stateChecks: { declared: 19, failing: [], passed: 19 },
	};
	return {
		baseline: Array.from({ length: 6 }, () => failedAttempt),
		candidate: Array.from({ length: 6 }, () => passedAttempt),
		control: Array.from({ length: 6 }, () => failedAttempt),
	};
}

function disputedStateComparison(): ComparisonResponseFixture {
	const body = comparisonResponseBody();
	return {
		...body,
		attempts: { ...body.attempts, "case-1": sessionAssessmentAttempts() },
		report: { ...body.report, mode: "session" },
		sessionAssessments: { "case-1": sessionAssessmentLayers() },
	};
}

function pipelinePairingComparison(): ComparisonResponseFixture {
	const body = comparisonResponseBody();
	return {
		...body,
		attempts: {
			...body.attempts,
			"case-1": {
				baseline: [PASSED, PASSED],
				candidate: [PASSED, PASSED, PASSED],
				control: [PASSED],
			},
		},
		report: { ...body.report, mode: "pipeline" },
		summary: {
			...body.summary,
			"case-1": {
				...caseSummary({ reasons: ["no cost"], state: "unavailable" }),
				contrasts: {
					candidateMinusBaseline: {
						final: ONE_EQUAL_COMBINATION,
						review: ONE_EQUAL_COMBINATION,
					},
				},
			},
		},
	};
}

export { disputedStateComparison, pipelinePairingComparison };
