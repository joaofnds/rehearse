import { describe, expect, it } from "bun:test";

import { runStageJudge } from "./stage-grading";
import observeStageJudgeCli from "./stage-judge-cli-test-fixture";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

const EMPTY_DIMENSION_COUNT = 0;
const FIRST_DIMENSION_COUNT = 1;
const PARTIAL_DIMENSION_COUNT = 2;
const COMPLETE_DIMENSION_COUNT = 3;

describe(runStageJudge.name, () => {
	describe("judge progress", () => {
		it("streams the Claude CLI's output into progress and grades from its result line", async () => {
			const { output, args } = await observeStageJudgeCli(testResources);

			expect(JSON.parse(output)).toEqual({
				grade: "A",
				returned: [
					EMPTY_DIMENSION_COUNT,
					FIRST_DIMENSION_COUNT,
					PARTIAL_DIMENSION_COUNT,
					COMPLETE_DIMENSION_COUNT,
					COMPLETE_DIMENSION_COUNT,
					COMPLETE_DIMENSION_COUNT,
					COMPLETE_DIMENSION_COUNT,
				],
			});
			expect(args).toContain(
				"stream-json\n--verbose\n--include-partial-messages",
			);
		});
	});
});
