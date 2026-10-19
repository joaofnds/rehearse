import { describe, expect, it } from "bun:test";

import { CalibrationIncompleteError, parseHumanReview } from "./calibration";

function parsesAStructuredHumanReview(): void {
	const review = parseHumanReview(
		JSON.stringify({
			findings: [
				{
					description: "The worker drops request metadata.",
					judgeAssessment: "MISSED",
					paths: ["src/audit/worker.ts"],
					rubricId: "worker-metadata",
				},
			],
			summary: "The worker loses metadata.",
			verdict: "REJECT",
		}),
	);

	const [observedFirstFinding] = review.findings;

	expect(review.verdict).toBe("REJECT");
	expect(observedFirstFinding?.rubricId).toBe("worker-metadata");
}

function reportsMalformedReviewJSONAsIncompleteCalibration(): void {
	expect(() => parseHumanReview("not json")).toThrow(
		CalibrationIncompleteError,
	);
}

function requiresARubricIDForJudgeRelatedFindings(): void {
	expect(() =>
		parseHumanReview(
			JSON.stringify({
				findings: [
					{
						description: "Missing worker behavior.",
						judgeAssessment: "MISSED",
						paths: [],
						rubricId: null,
					},
				],
				summary: "The Judge missed a defect.",
				verdict: "REJECT",
			}),
		),
	).toThrow();
}
describe(parseHumanReview.name, () => {
	it("parses a structured human review", parsesAStructuredHumanReview);
	it(
		"reports malformed review JSON as incomplete calibration",
		reportsMalformedReviewJSONAsIncompleteCalibration,
	);
	it(
		"requires a rubric ID for Judge-related findings",
		requiresARubricIDForJudgeRelatedFindings,
	);
});
