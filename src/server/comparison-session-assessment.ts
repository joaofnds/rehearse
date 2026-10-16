import { wilsonInterval } from "#benchmark/comparison-estimator";
import type { CaseAttempts, ComparisonAttempt } from "./comparison-attempts";

type CheckLayer = "checks" | "stateChecks";

export interface CheckLayerArmAssessment {
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

export interface CheckLayerAssessment {
	readonly baseline: CheckLayerArmAssessment;
	readonly candidate: CheckLayerArmAssessment;
	readonly control: CheckLayerArmAssessment;
}

export interface SessionComparisonAssessment {
	readonly title: string;
	readonly basis: CheckLayer | "unavailable";
	readonly stateChecks: CheckLayerAssessment;
	readonly checks: CheckLayerAssessment;
}

function passRate(
	passed: number,
	assessed: number,
): CheckLayerArmAssessment["passRate"] {
	if (assessed === 0) {
		return { state: "unavailable" };
	}

	const interval = wilsonInterval(passed, assessed);
	return {
		state: "available",
		low: interval.low * 100,
		high: interval.high * 100,
		value: (passed / assessed) * 100,
	};
}

function assessment(
	attempts: readonly ComparisonAttempt[],
	layer: CheckLayer,
): CheckLayerArmAssessment {
	const scores = attempts.flatMap((attempt) => attempt[layer] ?? []);
	const assessed = scores.filter(({ declared }) => declared > 0);
	const passed = assessed.filter(
		({ passed: passingChecks, declared, failing }) =>
			passingChecks === declared && failing.length === 0,
	).length;
	const undeclared = scores.filter(({ declared }) => declared === 0).length;

	return {
		assessed: assessed.length,
		passed,
		total: attempts.length,
		missing: attempts.length - scores.length,
		undeclared,
		declared: [...new Set(assessed.map(({ declared }) => declared))].toSorted(
			(left, right) => left - right,
		),
		passRate: passRate(passed, assessed.length),
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
	const before = arms.baseline;
	const after = arms.candidate;
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

export function comparisonSessionAssessment(
	attempts: CaseAttempts,
): SessionComparisonAssessment {
	const stateChecks = layerAssessment(attempts, "stateChecks");
	const checks = layerAssessment(attempts, "checks");
	if (stateChecks.baseline.assessed > 0 && stateChecks.candidate.assessed > 0) {
		return {
			title: conclusion(stateChecks, "stateChecks"),
			basis: "stateChecks",
			stateChecks,
			checks,
		};
	}
	if (checks.baseline.assessed > 0 && checks.candidate.assessed > 0) {
		return {
			title: conclusion(checks, "checks"),
			basis: "checks",
			stateChecks,
			checks,
		};
	}

	return {
		title: "No recorded check assessments to compare",
		basis: "unavailable",
		stateChecks,
		checks,
	};
}
