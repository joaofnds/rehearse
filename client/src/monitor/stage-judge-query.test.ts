import { describe, expect, it } from "bun:test";

import type { StageJudgeResponse } from "./stage-judge-query";
import { stageJudgeQuery } from "./stage-judge-query";

function intervalFor(data: StageJudgeResponse): number | false {
	return stageJudgeQuery("run", "build").refetchInterval({
		state: { data },
	});
}

describe(stageJudgeQuery.name, () => {
	it("re-reads a returning judge every 2 seconds, since writing the stage record records no run event", () => {
		const expectedIntervalFor = 2000;

		expect(intervalFor({ state: "returning" })).toBe(expectedIntervalFor);
	});

	it("leaves a judged stage's judge alone", () => {
		expect(
			intervalFor({ dimensions: [], hardBlockers: [], state: "judged" }),
		).toBe(false);
	});
});
