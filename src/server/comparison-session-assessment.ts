import { wilsonInterval } from "#benchmark/comparison-estimator";

import type { CaseAttempts, ComparisonAttempt } from "./comparison-attempts";

const NO_ASSESSED_RESULTS = 0;
const NO_DECLARED_CHECKS = 0;

const EMPTY_COLLECTION_LENGTH = 0;

const PERCENTAGE_POINTS_PER_UNIT = 100;

type CheckLayer = "checks" | "stateChecks";

interface CheckLayerArmAssessment {
	readonly assessed: number;
	readonly passed: number;
	readonly total: number;
	readonly missing: number;
	readonly undeclared: number;
	readonly declared: readonly number[];
	readonly passRate:
		| {
				readonly state: "available";
				readonly low: number;
				readonly high: number;
				readonly value: number;
		  }
		| { readonly state: "unavailable" };
}

interface CheckLayerAssessment {
	readonly baseline: CheckLayerArmAssessment;
	readonly candidate: CheckLayerArmAssessment;
	readonly control: CheckLayerArmAssessment;
}

interface SessionComparisonAssessment {
	readonly title: string;
	readonly basis: CheckLayer | "unavailable";
	readonly stateChecks: CheckLayerAssessment;
	readonly checks: CheckLayerAssessment;
}

function passRate(
	passed: number,
	assessed: number,
): CheckLayerArmAssessment["passRate"] {
	if (assessed === NO_ASSESSED_RESULTS) {
		return { state: "unavailable" };
	}

	const interval = wilsonInterval(passed, assessed);
	return {
		high: interval.high * PERCENTAGE_POINTS_PER_UNIT,
		low: interval.low * PERCENTAGE_POINTS_PER_UNIT,
		state: "available",
		value: (passed / assessed) * PERCENTAGE_POINTS_PER_UNIT,
	};
}

function assessment(
	attempts: readonly ComparisonAttempt[],
	layer: CheckLayer,
): CheckLayerArmAssessment {
	const scores = attempts.flatMap((attempt) => attempt[layer] ?? []);
	const assessed = scores.filter(
		({ declared }) => declared > NO_DECLARED_CHECKS,
	);
	const passed = assessed.filter(
		({ passed: passingChecks, declared, failing }) =>
			passingChecks === declared && failing.length === EMPTY_COLLECTION_LENGTH,
	).length;
	const undeclared = scores.filter(
		({ declared }) => declared === NO_DECLARED_CHECKS,
	).length;

	return {
		assessed: assessed.length,
		declared: [...new Set(assessed.map(({ declared }) => declared))].toSorted(
			(left, right) => left - right,
		),
		missing: attempts.length - scores.length,
		passRate: passRate(passed, assessed.length),
		passed,
		total: attempts.length,
		undeclared,
	};
}

function layerAssessment(
	attempts: CaseAttempts,
	layer: CheckLayer,
): CheckLayerAssessment {
	return {
		baseline: assessment(attempts.baseline, layer),
		candidate: assessment(attempts.candidate, layer),
		control: assessment(attempts.control, layer),
	};
}

function conclusion(arms: CheckLayerAssessment, layer: CheckLayer): string {
	const { baseline: before, candidate: after } = arms;
	const title = layer === "stateChecks" ? "Saved state" : "Reply / transcript";
	const label = layer === "stateChecks" ? "saved state" : "reply / transcript";
	if (before.assessed < before.total || after.assessed < after.total) {
		return `${title} comparison has incomplete coverage`;
	}
	if (after.passed / after.assessed > before.passed / before.assessed) {
		return `Candidate passed ${label} checks more often in this sample`;
	}
	if (after.passed / after.assessed < before.passed / before.assessed) {
		return `Candidate passed ${label} checks less often in this sample`;
	}

	return `No observed difference in ${label} pass rates`;
}

function comparisonSessionAssessment(
	attempts: CaseAttempts,
): SessionComparisonAssessment {
	const stateChecks = layerAssessment(attempts, "stateChecks");
	const checks = layerAssessment(attempts, "checks");
	if (
		stateChecks.baseline.assessed > NO_ASSESSED_RESULTS &&
		stateChecks.candidate.assessed > NO_ASSESSED_RESULTS
	) {
		return {
			basis: "stateChecks",
			checks,
			stateChecks,
			title: conclusion(stateChecks, "stateChecks"),
		};
	}
	if (
		checks.baseline.assessed > NO_ASSESSED_RESULTS &&
		checks.candidate.assessed > NO_ASSESSED_RESULTS
	) {
		return {
			basis: "checks",
			checks,
			stateChecks,
			title: conclusion(checks, "checks"),
		};
	}

	return {
		basis: "unavailable",
		checks,
		stateChecks,
		title: "No recorded check assessments to compare",
	};
}

export { comparisonSessionAssessment as default };
export type {
	CheckLayerArmAssessment,
	CheckLayerAssessment,
	SessionComparisonAssessment,
};
