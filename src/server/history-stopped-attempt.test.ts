import { afterEach, describe, expect, it } from "bun:test";

import { operatorStopRecord } from "#benchmark/operator-stop";
import { sessionAttemptPaths } from "#benchmark/run-layout";
import { directorySource } from "#benchmark/run-records-test-support";
import {
	clearHistoryRoots,
	corpusDirectory,
	writtenFixture,
} from "#server/history-workspace-test-fixture";

import { launchLiveness } from "./history-launch-test-fixture";
import { runHistoryReport } from "./run-history";
import type { RunHistoryReport } from "./run-history-contract";

afterEach(clearHistoryRoots);

const ATTEMPT = {
	caseId: "smoke",
	uuid: "0f6b6f2a-0000-4000-8000-000000000334",
};

/** The history of records holding one attempt the operator stopped. */
async function historyOfAStoppedAttempt(): Promise<RunHistoryReport> {
	const fixture = await writtenFixture();
	await fixture.sessions.writeEmptyAttemptDirectory(ATTEMPT);
	await Bun.write(
		sessionAttemptPaths(fixture.runsDirectory, ATTEMPT).operatorStopFile,
		operatorStopRecord("SIGTERM"),
	);

	return await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		launchLiveness(),
	);
}

describe(runHistoryReport.name, () => {
	describe("when the operator stopped a session attempt before its record", () => {
		it("leaves the attempt out rather than list it as unreadable", async () => {
			const { rows, unreadable } = await historyOfAStoppedAttempt();

			expect(rows.map(({ recordId }) => recordId)).not.toContain(
				`attempt:session:${ATTEMPT.caseId}/${ATTEMPT.uuid}`,
			);
			expect(unreadable).toEqual([]);
		});
	});
});
