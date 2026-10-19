import { describe, expect, it } from "bun:test";

import { runStageJudge } from "./stage-grading";
import observeStageJudge from "./stage-judge-observation-test-fixture";
import { complete, graded } from "./stage-judge-stream-test-fixtures";

const PREVIOUS_PROGRESS_READING_OFFSET = 1;

const NEXT_PROGRESS_READING_OFFSET = 1;

const FINAL_JUDGE_PROGRESS_EVENT_OFFSET = -1;

describe(runStageJudge.name, () => {
	describe("judge progress", () => {
		it("withdraws a rejected attempt's progress and counts the next attempt from none", async () => {
			const outputs = [
				{ ...complete, dimensions: [graded("d1"), graded("d2")] },
				complete,
			];
			const { scorecard, progress } = await observeStageJudge(
				outputs.map((output) => ({ frames: [output], response: output })),
			);

			const rejected = progress.findIndex(({ state }) => state === "rejected");

			expect(progress[rejected]).toEqual({
				attempt: 1,
				reason:
					"Stage Judge must return every quality dimensions item exactly once",
				state: "rejected",
			});
			expect(
				progress[rejected - PREVIOUS_PROGRESS_READING_OFFSET],
			).toMatchObject({
				attempt: 1,
				sections: { dimensions: { returned: 2, total: 3 } },
			});
			expect(progress[rejected + NEXT_PROGRESS_READING_OFFSET]).toMatchObject({
				attempt: 2,
				sections: { dimensions: { returned: 0, total: 3 } },
				state: "returning",
			});
			expect(progress.at(FINAL_JUDGE_PROGRESS_EVENT_OFFSET)).toMatchObject({
				attempt: 2,
				sections: { dimensions: { returned: 3, total: 3 } },
			});
			expect(scorecard.attempts.map(({ outcome }) => outcome)).toEqual([
				"REJECTED",
				"ACCEPTED",
			]);
		});
	});
});
