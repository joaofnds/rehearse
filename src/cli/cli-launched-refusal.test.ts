import { describe, expect, it, setDefaultTimeout } from "bun:test";

import { liveRunLiveness } from "#benchmark/run-liveness";
import { CliTestWorkspace } from "#cli/cli-test-support";
import { runListing } from "#server/run-history";

import { eventually, isRunning } from "./cli-confinement-test-fixture";
import { CLI_TEST_TIMEOUT_MS } from "./cli-process-test-driver";
import {
	REFUSED_LAUNCH_ID,
	refusedLaunch,
} from "./cli-refused-launch-test-fixture";

const workspace = CliTestWorkspace.forEachTest();

setDefaultTimeout(CLI_TEST_TIMEOUT_MS);

const REFUSED_PRECONDITION_EXIT_CODE = 3;

const SPEND_CEILING_REFUSAL =
	"No spend ceiling is stored, and nothing spends without one. Set it with: rehearse settings --spend-ceiling-usd <USD>";

describe("a browser launch the CLI refuses", () => {
	it("lists as ENDED with the refusal once its confined command exits", async () => {
		const { pid, records } = await refusedLaunch(workspace);
		await eventually(async () => await Promise.resolve(!isRunning(pid)));

		const { launches } = await runListing(records, liveRunLiveness());

		expect(launches).toMatchObject([
			{
				ending: {
					exitCode: REFUSED_PRECONDITION_EXIT_CODE,
					message: SPEND_CEILING_REFUSAL,
				},
				id: REFUSED_LAUNCH_ID,
				status: "ENDED",
			},
		]);
	});
});
