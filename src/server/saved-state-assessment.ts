import type { SessionAttemptState } from "#benchmark/session-record";
import type { Immutable } from "#benchmark/contracts";
import { redactAbsolutePaths } from "./redact-path";

export type SavedStateAssessment =
	| {
			readonly state: "assessed";
			readonly passed: number;
			readonly failed: number;
			readonly total: number;
	  }
	| { readonly state: "unavailable"; readonly reason: string };

export function savedStateAssessment(
	record: Immutable<SessionAttemptState>,
): SavedStateAssessment {
	if ("stateGradingError" in record && record.stateGradingError !== undefined) {
		return {
			state: "unavailable",
			reason: redactAbsolutePaths(record.stateGradingError),
		};
	}
	if (!("stateResults" in record) || record.stateResults === undefined) {
		return {
			state: "unavailable",
			reason: "No saved state assessment was recorded; declaration is unknown.",
		};
	}
	if (record.stateResults.length === 0) {
		return {
			state: "unavailable",
			reason: "No saved state check outcomes were recorded.",
		};
	}
	const passed = record.stateResults.filter(
		({ status }) => status === "PASS",
	).length;
	return {
		state: "assessed",
		passed,
		failed: record.stateResults.length - passed,
		total: record.stateResults.length,
	};
}
