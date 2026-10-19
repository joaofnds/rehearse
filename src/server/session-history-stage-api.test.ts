import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { writtenStage } from "#server/session-history-stage-test-fixture";
import {
	clearSessionHistoryRoots,
	startHistoryApi,
} from "#server/session-history-workspace-test-fixture";

afterEach(clearSessionHistoryRoots);

describe("/api/runs/:run/stages/:stage/history", () => {
	describe("GET", () => {
		it(
			"serves a stage summary, its event detail and its corpus reconciliation",
			verifyServesAStageSummaryItsEventDetailAndIts,
		);

		it(
			"refuses a traversing run segment without leaking an absolute path",
			verifyRefusesATraversingRunSegmentWithoutLeakingAnAbsolute,
		);
	});
});

async function verifyServesAStageSummaryItsEventDetailAndIts(): Promise<void> {
	const fixture = await writtenStage();
	const api = await startHistoryApi(fixture.runsDirectory);

	const summary = await api.savedEvidence.stageHistory(fixture);
	const detail = await api.savedEvidence.stageDetail(fixture, "2:1");
	const corpus = await api.savedEvidence.stageCorpus(fixture);

	expect(summary.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(detail.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(corpus.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await corpus.json()).toEqual([
		{
			firstLocator: { block: 1, line: 1 },
			path: "CLAUDE.md",
			state: "observed",
		},
		{ path: "skills/build/SKILL.md", state: "no-observation-recorded" },
	]);
}

async function verifyRefusesATraversingRunSegmentWithoutLeakingAnAbsolute(): Promise<void> {
	const fixture = await writtenStage();
	const api = await startHistoryApi(fixture.runsDirectory);

	const response = await api.savedEvidence.stageHistory({
		...fixture,
		run: "../escape",
		stage: "shape",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
	expect(JSON.stringify(await response.json())).not.toContain(
		fixture.runsDirectory,
	);
}
