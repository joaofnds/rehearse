import { describe, expect, it } from "bun:test";
import type { StageSessionResponse } from "./stage-session-query";
import { stageSessionQuery } from "./stage-session-query";

describe(stageSessionQuery.name, () => {
	function intervalFor(data: StageSessionResponse): number | false {
		return stageSessionQuery("run", "build").refetchInterval({
			state: { data },
		});
	}

	it("re-reads a running stage's session every 2 seconds, since a transcript append records no run event", () => {
		expect(intervalFor({ state: "running", lineCount: 0, lines: [] })).toBe(
			2000,
		);
	});

	it("leaves a closed stage's session alone", () => {
		expect(intervalFor({ state: "closed", spans: [] })).toBe(false);
	});
});
