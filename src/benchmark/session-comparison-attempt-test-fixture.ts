import type { Immutable } from "./contracts";
import type { SessionAttempt } from "./session-attempt";
import type { AttemptVariantSelector } from "./session-comparison-test-contract";
import {
	FIRST_REP_ORDINAL,
	SECOND_REP_ORDINAL,
} from "./session-comparison-test-contract";
import type { StateCheck, StateResult } from "./session-state-check";

const metrics = {
	cacheReadTokens: 3,
	cacheWriteTokens: 4,
	costUsd: 0.02,
	inputTokens: 10,
	outputTokens: 2,
	turns: 1,
};

const unavailableTranscriptDiagnostics = {
	prefixLinesExcluded: 0,
	state: "unavailable",
} as const;

function attemptMetrics(caseId: string, ordinal: number): typeof metrics {
	if (caseId !== "case-four") {
		return metrics;
	}

	return { ...metrics, costUsd: metrics.costUsd * ordinal };
}

function attemptChecks(
	caseId: string,
	pass: boolean,
	ordinal: number,
): SessionAttempt["checks"] {
	const wordBand = {
		detail: pass ? "1 word" : "3 words",
		kind: "word-band" as const,
		status: pass ? ("PASS" as const) : ("FAIL" as const),
	};
	if (caseId !== "case-three") {
		return [wordBand];
	}

	const toolCallsPassed = pass || ordinal === FIRST_REP_ORDINAL;

	return [
		wordBand,
		{
			detail: toolCallsPassed ? "0 tool calls" : "3 tool calls",
			kind: "tool-calls",
			status: toolCallsPassed ? "PASS" : "FAIL",
		},
	];
}

function attemptStateResults(
	stateCheck: Immutable<StateCheck>,
	pass: boolean,
): readonly StateResult[] {
	return stateCheck.outcomes.map((name) => ({
		detail: pass ? `${name} holds` : `${name} does not hold`,
		name,
		status: pass ? "PASS" : "FAIL",
	}));
}

const selectUnavailableEvidence: AttemptVariantSelector = (
	caseId,
	role,
	ordinal,
): "no-reply" | "execution-failed" | "missing-metrics" | undefined => {
	if (caseId !== "case-one") {
		return undefined;
	}

	if (role === "candidate") {
		return ordinal === FIRST_REP_ORDINAL ? "no-reply" : "execution-failed";
	}

	if (role === "baseline" && ordinal === SECOND_REP_ORDINAL) {
		return "missing-metrics";
	}

	return undefined;
};

export {
	selectUnavailableEvidence,
	metrics,
	unavailableTranscriptDiagnostics,
	attemptMetrics,
	attemptChecks,
	attemptStateResults,
};
