import { expect, it } from "bun:test";

import { GIT_SHA1_HEX_DIGITS } from "#server/digest-test-support";

import { qualityFailureCount } from "./confirmation-group-summary";

const QUALITY_FAILURE_REPS = [
	{
		finalOutcome: {
			evidence: {
				recordFile: "final.json",
				resultSha: "b".repeat(GIT_SHA1_HEX_DIGITS),
			},
			status: "JUDGED",
			verdict: "FAIL",
		},
		stages: [
			{
				elapsedMs: 10,
				evidence: {
					recordFile: "scorecard.json",
					resultSha: "a".repeat(GIT_SHA1_HEX_DIGITS),
				},
				grade: "D",
				stage: "build",
				status: "JUDGED",
				verdict: "STOP",
			},
		],
	},
	{
		finalOutcome: { status: "NOT_APPLICABLE" },
		stages: [
			{
				elapsedMs: 10,
				evidence: {
					recordFile: "scorecard.json",
					resultSha: "a".repeat(GIT_SHA1_HEX_DIGITS),
				},
				grade: "F",
				stage: "checks",
				status: "JUDGED",
				verdict: "STOP",
			},
		],
	},
	{
		finalOutcome: {
			evidence: {
				recordFile: "final.json",
				resultSha: "b".repeat(GIT_SHA1_HEX_DIGITS),
			},
			status: "JUDGED",
			verdict: "FAIL",
		},
		stages: [
			{
				elapsedMs: 10,
				evidence: {
					recordFile: "scorecard.json",
					resultSha: "a".repeat(GIT_SHA1_HEX_DIGITS),
				},
				grade: "A",
				stage: "build",
				status: "JUDGED",
				verdict: "CONTINUE",
			},
		],
	},
] as const;

const NON_QUALITY_FAILURE_REPS = [
	{
		finalOutcome: { status: "NOT_APPLICABLE" },
		stages: [{ reason: "stopped", stage: "build", status: "NOT_REACHED" }],
	},
	{
		finalOutcome: {
			error: "Judge unavailable",
			status: "EXECUTION_FAILED",
		},
		stages: [
			{
				error: "provider unavailable",
				stage: "build",
				status: "EXECUTION_FAILED",
			},
		],
	},
	{
		finalOutcome: {
			evidence: {
				recordFile: "final.json",
				resultSha: "b".repeat(GIT_SHA1_HEX_DIGITS),
			},
			status: "JUDGED",
			verdict: "PASS",
		},
		stages: [
			{
				elapsedMs: 10,
				evidence: {
					recordFile: "scorecard.json",
					resultSha: "a".repeat(GIT_SHA1_HEX_DIGITS),
				},
				grade: "A",
				stage: "build",
				status: "JUDGED",
				verdict: "CONTINUE",
			},
		],
	},
] as const;

it("counts recorded rejected steps, failed session checks and final failures once per rep", () => {
	const expectedQualityFailureCount = 3;

	expect(qualityFailureCount(QUALITY_FAILURE_REPS)).toBe(
		expectedQualityFailureCount,
	);
});

it("does not turn missing judgments or execution failures into quality failures", () => {
	const expectedQualityFailureCount = 0;

	expect(qualityFailureCount(NON_QUALITY_FAILURE_REPS)).toBe(
		expectedQualityFailureCount,
	);
});
