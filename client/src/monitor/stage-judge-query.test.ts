import { describe, expect, it } from "bun:test";
import type { StageJudgeResponse } from "./stage-judge-query";
import { stageJudgeQuery } from "./stage-judge-query";

describe(stageJudgeQuery.name, () => {
	function intervalFor(data: StageJudgeResponse): number | false {
		return stageJudgeQuery("run", "build").refetchInterval({
			state: { data },
		});
	}

	it("re-reads a returning judge every 2 seconds, since writing the stage record records no run event", () => {
		expect(intervalFor({ state: "returning" })).toBe(2000);
	});

	it("leaves a judged stage's judge alone", () => {
		expect(
			intervalFor({ state: "judged", hardBlockers: [], dimensions: [] }),
		).toBe(false);
	});
});
