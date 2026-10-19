import { describe, expect, it } from "bun:test";

import type { StageSessionResponse } from "./stage-session-query";
import { stageSessionQuery } from "./stage-session-query";

function intervalFor(data: StageSessionResponse): number | false {
	return stageSessionQuery("run", "build").refetchInterval({
		state: { data },
	});
}

describe(stageSessionQuery.name, () => {
	it("re-reads a running stage's session every 2 seconds, since a transcript append records no run event", () => {
		const expectedIntervalFor = 2000;

		expect(intervalFor({ lineCount: 0, lines: [], state: "running" })).toBe(
			expectedIntervalFor,
		);
	});

	it("leaves a closed stage's session alone", () => {
		expect(intervalFor({ spans: [], state: "closed" })).toBe(false);
	});
});
