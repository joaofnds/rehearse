import { describe, expect, it } from "bun:test";

import { operatorStopRecord } from "#benchmark/operator-stop";
import { sessionAttemptPaths } from "#benchmark/run-layout";
import { CliTestWorkspace, recordOutput } from "#cli/cli-test-support";
import { runList } from "#cli/list-command";

const workspace = CliTestWorkspace.forEachTest();

const STOPPED_UUID = "0f6b6f2a-0000-4000-8000-000000000334";

/** What `list attempts` prints beside one attempt the operator stopped. */
async function listingBesideAStoppedAttempt(): Promise<string> {
	const fixture = await workspace.writtenRecords();
	const recorder = recordOutput();
	await Bun.write(
		sessionAttemptPaths(fixture.runsDirectory, {
			caseId: "smoke",
			uuid: STOPPED_UUID,
		}).operatorStopFile,
		operatorStopRecord("SIGTERM"),
	);

	await runList(
		{ kind: "attempts", runsDirectory: fixture.runsDirectory },
		recorder.output,
	);

	return [...recorder.stdout, ...recorder.stderr].join("");
}

describe(runList.name, () => {
	describe("when the operator stopped a session attempt before its record", () => {
		it("leaves the attempt out rather than list it as unreadable", async () => {
			const printed = await listingBesideAStoppedAttempt();

			expect(printed).not.toContain(STOPPED_UUID);
		});
	});
});
