import type { Immutable } from "#benchmark/contracts";
import type { SessionAttemptState } from "#benchmark/session-record";

import { redactAbsolutePaths } from "./redact-path";

const EMPTY_COLLECTION_LENGTH = 0;

type SavedStateAssessment =
	| {
			readonly state: "assessed";
			readonly passed: number;
			readonly failed: number;
			readonly total: number;
	  }
	| { readonly state: "unavailable"; readonly reason: string };

function savedStateAssessment(
	record: Immutable<SessionAttemptState>,
): SavedStateAssessment {
	if ("stateGradingError" in record && record.stateGradingError !== undefined) {
		return {
			reason: redactAbsolutePaths(record.stateGradingError),
			state: "unavailable",
		};
	}
	if (!("stateResults" in record) || record.stateResults === undefined) {
		return {
			reason: "No saved state assessment was recorded; declaration is unknown.",
			state: "unavailable",
		};
	}
	if (record.stateResults.length === EMPTY_COLLECTION_LENGTH) {
		return {
			reason: "No saved state check outcomes were recorded.",
			state: "unavailable",
		};
	}
	const passed = record.stateResults.filter(
		({ status }) => status === "PASS",
	).length;
	return {
		failed: record.stateResults.length - passed,
		passed,
		state: "assessed",
		total: record.stateResults.length,
	};
}

export { savedStateAssessment as default };
export type { SavedStateAssessment };
