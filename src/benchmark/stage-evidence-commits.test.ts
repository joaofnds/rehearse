import { describe, expect, it } from "bun:test";

import { runStageJudge } from "./stage-grading";
import { stageEvidence, stageJudgeInput } from "./stage-grading-test-fixtures";
import { validateStageJudgeEvidence } from "./stage-judge-evidence";
import { judgeResponse, rubricSource } from "./stage-judge-test-fixtures";
import { judgeBudget } from "./test-support";

describe(runStageJudge.name, () => {
	it("accepts commit subjects as citable stage evidence", async () => {
		let prompt = "";
		const input = stageJudgeInput("build", {
			commitSubjects: ["add audit event"],
		});

		const scorecard = await runStageJudge(
			{ budget: judgeBudget(), effort: undefined, model: "sonnet" },
			{ input, source: rubricSource },
			{
				invoke: async (judgePrompt) => {
					prompt = judgePrompt;

					return await Promise.resolve(
						judgeResponse("commitSubjects", "commit-subjects", "audit event"),
					);
				},
			},
		);

		expect(scorecard.grade.grade).toBe("A");
		expect(prompt).toContain(
			"commitSubjects (or commit-subjects) as the whole-source path for commit-subjects",
		);
		expect(() => {
			validateStageJudgeEvidence(
				{
					...scorecard.grade,
					requirements: [
						{
							evidence: [stageEvidence("commit-subjects", "commit-subjects")],
							id: "scope",
							status: "PASS",
						},
					],
				},
				input,
			);
		}).not.toThrow();
	});
});
