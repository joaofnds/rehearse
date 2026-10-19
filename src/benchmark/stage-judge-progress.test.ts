import { describe, expect, it } from "bun:test";

import { runStageJudge } from "./stage-grading";
import observeStageJudge from "./stage-judge-observation-test-fixture";
import {
	complete,
	graded,
	latestItems,
	pass,
} from "./stage-judge-stream-test-fixtures";

async function countsClosedItemsBeforeGradeExists(): Promise<void> {
	const { scorecard, progress, beforeGrade } = await observeStageJudge([
		{
			frames: [
				{
					dimensions: [graded("d1"), graded("d2")],
					hardBlockers: [pass("b1")],
				},
			],
			response: complete,
		},
	]);

	const [observedFirstProgres] = progress;

	expect(observedFirstProgres).toEqual({
		attempt: 1,
		items: {
			dimensions: [{ id: "d1" }, { id: "d2" }, { id: "d3" }],
			hardBlockers: [{ id: "b1" }, { id: "b2" }],
		},
		sections: {
			dimensions: { returned: 0, total: 3 },
			hardBlockers: { returned: 0, total: 2 },
			requirements: { returned: 0, total: 1 },
		},
		state: "returning",
	});
	expect(beforeGrade).toEqual({
		attempt: 1,
		items: {
			dimensions: [
				{ grade: "A", id: "d1" },
				{ grade: "A", id: "d2" },
				{ id: "d3" },
			],
			hardBlockers: [{ id: "b1", status: "PASS" }, { id: "b2" }],
		},
		sections: {
			dimensions: { returned: 2, total: 3 },
			hardBlockers: { returned: 1, total: 2 },
			requirements: { returned: 0, total: 1 },
		},
		state: "returning",
	});
	expect(scorecard.grade.grade).toBe("A");
}

async function reportsEachReturnedBlockerAndDimension(): Promise<void> {
	const { progress } = await observeStageJudge([
		{
			frames: [{ hardBlockers: [{ ...pass("b2"), status: "FAIL" }] }],
			response: complete,
		},
	]);

	expect(latestItems(progress)).toEqual({
		dimensions: [{ id: "d1" }, { id: "d2" }, { id: "d3" }],
		hardBlockers: [{ id: "b1" }, { id: "b2", status: "FAIL" }],
	});
}

describe(runStageJudge.name, () => {
	describe("judge progress", () => {
		it(
			"counts each item as it closes, per rubric section, before any grade exists",
			countsClosedItemsBeforeGradeExists,
		);

		it(
			"names every blocker and dimension with the result of each one returned",
			reportsEachReturnedBlockerAndDimension,
		);
	});
});
