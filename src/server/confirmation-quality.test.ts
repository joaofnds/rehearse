import { expect, it } from "bun:test";
import { qualityFailureCount } from "./confirmation-group-summary";

it("counts recorded rejected steps, failed session checks and final failures once per rep", () => {
	expect(
		qualityFailureCount([
			{
				stages: [
					{
						stage: "build",
						status: "JUDGED",
						grade: "D",
						verdict: "STOP",
						elapsedMs: 10,
						evidence: {
							recordFile: "scorecard.json",
							resultSha: "a".repeat(40),
						},
					},
				],
				finalOutcome: {
					status: "JUDGED",
					verdict: "FAIL",
					evidence: { recordFile: "final.json", resultSha: "b".repeat(40) },
				},
			},
			{
				stages: [
					{
						stage: "checks",
						status: "JUDGED",
						grade: "F",
						verdict: "STOP",
						elapsedMs: 10,
						evidence: {
							recordFile: "scorecard.json",
							resultSha: "a".repeat(40),
						},
					},
				],
				finalOutcome: { status: "NOT_APPLICABLE" },
			},
			{
				stages: [
					{
						stage: "build",
						status: "JUDGED",
						grade: "A",
						verdict: "CONTINUE",
						elapsedMs: 10,
						evidence: {
							recordFile: "scorecard.json",
							resultSha: "a".repeat(40),
						},
					},
				],
				finalOutcome: {
					status: "JUDGED",
					verdict: "FAIL",
					evidence: { recordFile: "final.json", resultSha: "b".repeat(40) },
				},
			},
		]),
	).toBe(3);
});

it("does not turn missing judgments or execution failures into quality failures", () => {
	expect(
		qualityFailureCount([
			{
				stages: [{ stage: "build", status: "NOT_REACHED", reason: "stopped" }],
				finalOutcome: { status: "NOT_APPLICABLE" },
			},
			{
				stages: [
					{
						stage: "build",
						status: "EXECUTION_FAILED",
						error: "provider unavailable",
					},
				],
				finalOutcome: {
					status: "EXECUTION_FAILED",
					error: "Judge unavailable",
				},
			},
			{
				stages: [
					{
						stage: "build",
						status: "JUDGED",
						grade: "A",
						verdict: "CONTINUE",
						elapsedMs: 10,
						evidence: {
							recordFile: "scorecard.json",
							resultSha: "a".repeat(40),
						},
					},
				],
				finalOutcome: {
					status: "JUDGED",
					verdict: "PASS",
					evidence: { recordFile: "final.json", resultSha: "b".repeat(40) },
				},
			},
		]),
	).toBe(0);
});
