import { describe, expect, it } from "bun:test";

import { runStageJudge } from "./stage-grading";
import observeStageJudge from "./stage-judge-observation-test-fixture";
import {
	cited,
	complete,
	graded,
	latestItems,
} from "./stage-judge-stream-test-fixtures";

const FINAL_JUDGE_PROGRESS_EVENT_OFFSET = -1;

async function doesNotCountItemsFailingTheirChecks(): Promise<void> {
	const { progress } = await observeStageJudge([
		{
			frames: [
				{
					dimensions: [
						graded("unknown"),
						{ ...graded("d1"), evidence: [{ ...cited, path: "nowhere.md" }] },
						{ ...graded("d2"), evidence: [{ ...cited, quote: "absent" }] },
						graded("d3"),
						graded("d3"),
					],
				},
			],
			response: complete,
		},
	]);

	expect(progress.at(FINAL_JUDGE_PROGRESS_EVENT_OFFSET)).toMatchObject({
		sections: { dimensions: { returned: 1, total: 3 } },
	});
}

async function countsOnlyLatestOutputWithinAttempt(): Promise<void> {
	const { progress } = await observeStageJudge([
		{
			frames: [
				{ dimensions: [graded("d1"), graded("d2")] },
				{ dimensions: [graded("d3")] },
			],
			response: complete,
		},
	]);

	expect(progress.at(FINAL_JUDGE_PROGRESS_EVENT_OFFSET)).toMatchObject({
		attempt: 1,
		sections: { dimensions: { returned: 1, total: 3 } },
	});
	expect(latestItems(progress)?.dimensions).toEqual([
		{ id: "d1" },
		{ id: "d2" },
		{ grade: "A", id: "d3" },
	]);
}

async function gradesStageWhenProgressReportsFail(): Promise<void> {
	const { scorecard } = await observeStageJudge(
		[{ frames: [complete], response: complete }],
		() => {
			throw new Error("run event store closed");
		},
	);

	expect(scorecard.grade.grade).toBe("A");
}

describe(runStageJudge.name, () => {
	describe("judge progress", () => {
		it(
			"does not count an item that fails its own checks",
			doesNotCountItemsFailingTheirChecks,
		);

		it(
			"counts only the output the judge wrote last when it starts over within one attempt",
			countsOnlyLatestOutputWithinAttempt,
		);

		it(
			"grades the stage when every progress report fails",
			gradesStageWhenProgressReportsFail,
		);
	});
});
