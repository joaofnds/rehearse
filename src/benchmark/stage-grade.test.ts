import { describe, expect, it } from "bun:test";

import { deriveStageGrade } from "./stage-grade";
import { stageJudgeOutput } from "./stage-grading-test-fixtures";
import { parseStageRubric } from "./stage-rubric";

const rubric = parseStageRubric(
	JSON.stringify({
		dimensions: [
			{
				description: "Clear output",
				excellent: "Precise",
				good: "Concrete",
				id: "clarity",
			},
		],
		hardBlockers: [
			{
				description: "Valid delivery",
				id: "invalid-stage-delivery",
			},
			{ description: "No conflict", id: "contradiction" },
		],
		requirements: [{ description: "Scope is explicit", id: "scope" }],
		stage: "discuss",
	}),
);

describe(deriveStageGrade.name, () => {
	it("continues when every requirement passes and quality is B", () => {
		const grade = deriveStageGrade(
			stageJudgeOutput("PASS", "PASS", "B"),
			rubric,
		);

		expect(grade.grade).toBe("B");
		expect(grade.verdict).toBe("CONTINUE");
	});

	it("stops with F when a hard blocker is triggered", () => {
		const grade = deriveStageGrade(
			stageJudgeOutput("FAIL", "PASS", "A"),
			rubric,
		);

		expect(grade.grade).toBe("F");
		expect(grade.verdict).toBe("STOP");
	});

	it("caps a missing requirement below B", () => {
		const grade = deriveStageGrade(
			stageJudgeOutput("PASS", "FAIL", "A"),
			rubric,
		);

		expect(grade.grade).toBe("C");
		expect(grade.verdict).toBe("STOP");
	});

	it("uses the worst quality dimension without averaging", () => {
		const grade = deriveStageGrade(
			stageJudgeOutput("PASS", "PASS", "C"),
			rubric,
		);

		expect(grade.grade).toBe("C");
		expect(grade.verdict).toBe("STOP");
	});
});
