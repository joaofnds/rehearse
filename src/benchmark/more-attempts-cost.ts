import type { ComparisonArm } from "./comparison-record";
import { COMPARISON_ARMS } from "./comparison-record";

const EMPTY_COLLECTION_LENGTH = 0;

const PROJECTION_SIGNIFICANT_DIGITS = 15;

/** The part of a comparison arm's resources that says what its attempts cost. */
type ArmResources =
	| {
			readonly status: "AVAILABLE";
			readonly total: { readonly costUsd: { readonly mean: number } };
	  }
	| {
			readonly status: "UNAVAILABLE";
			readonly missingEvidence: readonly {
				readonly repId: string;
				readonly missing: readonly string[];
			}[];
	  };

type MoreAttemptsCost =
	| {
			readonly state: "available";
			readonly attemptsPerArm: number;
			readonly usd: number;
	  }
	| { readonly state: "unavailable"; readonly reasons: readonly string[] };

function missingCostReasons(
	resources: Extract<ArmResources, { readonly status: "UNAVAILABLE" }>,
): string[] {
	return resources.missingEvidence.map(
		({ repId, missing }) => `${repId} lacks ${missing.join(", ")}`,
	);
}

/**
 * What adding attempts to every arm of a comparison costs, at each arm's
 * recorded cost per attempt, so the operator reads it before anything runs.
 */
function moreAttemptsCost(
	arms: Readonly<Record<ComparisonArm, ArmResources>>,
	attemptsPerArm: number,
): MoreAttemptsCost {
	const reasons: string[] = [];
	let perAttemptUsd = 0;
	for (const arm of COMPARISON_ARMS) {
		const resources = arms[arm];
		if (resources.status === "UNAVAILABLE") {
			reasons.push(...missingCostReasons(resources));
		} else {
			perAttemptUsd += resources.total.costUsd.mean;
		}
	}
	if (reasons.length > EMPTY_COLLECTION_LENGTH) {
		return { reasons, state: "unavailable" };
	}

	return {
		attemptsPerArm,
		state: "available",
		usd: Number(
			(perAttemptUsd * attemptsPerArm).toPrecision(
				PROJECTION_SIGNIFICANT_DIGITS,
			),
		),
	};
}

export { missingCostReasons, moreAttemptsCost };
export type { ArmResources, MoreAttemptsCost };
