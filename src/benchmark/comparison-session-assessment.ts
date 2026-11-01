import type { Immutable } from "./contracts";
import { sessionQualityReading } from "./session-quality-reading";
import type { SessionQualityReading } from "./session-quality-reading";
import type { SessionAttemptRecord } from "./session-record";
import type { StateResult } from "./session-state-check";

interface RepCheckScore {
	readonly passed: number;
	readonly declared: number;
	readonly failing: readonly {
		readonly index: number;
		readonly kind: string;
		readonly detail: string;
	}[];
}

interface RepStateScore {
	readonly passed: number;
	readonly declared: number;
	readonly failing: readonly {
		readonly name: string;
		readonly detail: string;
	}[];
}

interface RepStateScoreField {
	readonly stateResults?: RepStateScore | undefined;
}

/**
 * The per-check tally beside the rep's pass or fail grade. A grade of F says
 * nothing about whether one check failed or all of them, and a check result
 * carries no name, so a failing check is identified by its position in the
 * case's declaration list together with its kind.
 */
function repCheckScore(
	attempt: Immutable<SessionAttemptRecord>,
): RepCheckScore {
	const failing = attempt.checks.flatMap((check, index) =>
		check.status === "FAIL"
			? [{ detail: check.detail, index, kind: check.kind }]
			: [],
	);

	return {
		declared: attempt.checks.length,
		failing,
		passed: attempt.checks.length - failing.length,
	};
}

function repStateScoreField(
	attempt: Immutable<SessionAttemptRecord>,
): RepStateScoreField {
	if (!("stateResults" in attempt) || attempt.stateResults === undefined) {
		return {};
	}

	return { stateResults: repStateScore(attempt.stateResults) };
}

function repStateScore(
	results: readonly Immutable<StateResult>[],
): RepStateScore {
	const failing = results.flatMap((result) =>
		result.status === "FAIL"
			? [{ detail: result.detail, name: result.name }]
			: [],
	);

	return {
		declared: results.length,
		failing,
		passed: results.length - failing.length,
	};
}

interface SessionRepAssessment {
	readonly checks: RepCheckScore;
	readonly judge?: SessionQualityReading | undefined;
	readonly stateResults?: RepStateScore | undefined;
}

function sessionRepAssessment(
	attempt: Immutable<SessionAttemptRecord>,
): SessionRepAssessment {
	return {
		checks: repCheckScore(attempt),
		judge: sessionQualityReading(attempt.judge),
		...repStateScoreField(attempt),
	};
}

export { sessionRepAssessment as default };
export type { RepCheckScore, RepStateScore };
export type { SessionQualityReading } from "./session-quality-reading";
