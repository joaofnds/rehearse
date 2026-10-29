import { afterEach, describe, expect, it } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { sessionAttemptPaths } from "#benchmark/run-layout";
import {
	subagentAttemptRates,
	writtenSubagentAttempt,
} from "#server/session-history-agents-test-fixture";
import { readSessionAttemptRequestSeries } from "#server/session-history-reader";
import { clearSessionHistoryRoots } from "#server/session-history-workspace-test-fixture";

afterEach(clearSessionHistoryRoots);

/** The fixture's one sub-agent request, at subagentAttemptRates. */
const UNREAD_SUBAGENT_COST_USD = 0.375;

async function leavesUnreadableSpendInIncompleteDifference(): Promise<void> {
	const fixture = await writtenSubagentAttempt();
	const paths = sessionAttemptPaths(fixture.runsDirectory, fixture);
	await writeFile(
		join(paths.directory, "subagents", "agent-k1.jsonl"),
		"not json",
	);

	const { cost } = await readSessionAttemptRequestSeries(
		fixture,
		subagentAttemptRates,
	);

	expect(cost.difference).toEqual({
		costUsd: UNREAD_SUBAGENT_COST_USD,
		pricedRequestCount: 2,
		reasons: [
			"a reading it is drawn from is incomplete",
			"sub-agent k1's transcript line 1 cannot be read",
		],
		requestCount: 2,
		state: "incomplete",
	});
}

describe(readSessionAttemptRequestSeries.name, () => {
	describe("when the attempt kept an unreadable sub-agent transcript", () => {
		it(
			"leaves the sub-agent's spend in an incomplete difference naming its line",
			leavesUnreadableSpendInIncompleteDifference,
		);
	});
});
