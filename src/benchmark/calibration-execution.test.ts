import { describe, expect, it } from "bun:test";

import { calibrate } from "./calibration";
import { humanReview, stageScorecard } from "./calibration-grade-test-fixtures";
import { parseStageRubric } from "./stage-rubric";

async function recordsAStageRubricChangeAndItsRevisedScorecardFromValuesAlone(): Promise<void> {
	const original = stageScorecard("PASS");
	const editedRubric = JSON.stringify({
		...original.rubric,
		requirements: [
			{ description: "Scope is explicit and observable", id: "scope" },
		],
	});
	const revised = {
		...stageScorecard("FAIL"),
		rubric: parseStageRubric(editedRubric),
	};

	const result = await calibrate(
		{
			current: {
				finalRubric: "1. `old`: Old requirement.\n",
				instructions: "Instructions",
				stageRubrics: new Map([["discuss", editedRubric]]),
			},
			frozen: {
				finalRubric: "1. `old`: Old requirement.\n",
				instructions: "Instructions",
				stageScorecards: [original],
			},
			review: humanReview(
				{ judgeAssessment: "MISSED", rubricId: "scope", verdict: "REJECT" },
				"discuss",
			),
		},
		{
			stageJudge: async () => await Promise.resolve(revised),
		},
	);

	expect(result.stageRubricsChanged).toEqual(["discuss"]);
	expect(result.revisedStageScorecards).toEqual([revised]);
	expect(result.instructionsChanged).toBe(false);
	expect(result.rubricChanged).toBe(false);
}

async function returnsTheSameResultForTheSameArguments(): Promise<void> {
	const frozen = {
		finalRubric: "1. `old`: Old requirement.\n",
		instructions: "Instructions",
		stageScorecards: [stageScorecard("PASS")],
	};
	const current = {
		finalRubric: "1. `old`: Old requirement.\n",
		instructions: "Edited instructions",
		stageRubrics: new Map<string, string>(),
	};
	const review = humanReview(
		{ judgeAssessment: "NOT_PROMOTED", rubricId: "scope", verdict: "REJECT" },
		"discuss",
	);
	const judges = {
		stageJudge: async () => await Promise.reject(new Error("no stage rejudge")),
	};

	const [first, second] = await Promise.all([
		calibrate({ current, frozen, review }, judges),
		calibrate({ current, frozen, review }, judges),
	]);

	expect(first).toEqual(second);
	expect(first.instructionsChanged).toBe(true);
	expect(first.updatedInstructions).toBe("Edited instructions");
	expect(first.rejudgeConfirmedByHuman).toBeUndefined();
}
describe(calibrate.name, () => {
	it(
		"records a stage rubric change and its revised scorecard from values alone",
		recordsAStageRubricChangeAndItsRevisedScorecardFromValuesAlone,
	);
	it(
		"returns the same result for the same arguments",
		returnsTheSameResultForTheSameArguments,
	);
});
