import { describe, expect, it } from "bun:test";

import { liftingRefusal } from "#benchmark/command-refusal-test-probe";
import StoppableAnalysisCall from "#benchmark/root-cause-analysis-stop-test-fixture";
import { runStoppedAtBuild } from "#benchmark/root-cause-analysis-test-support";
import { nothingRunning } from "#benchmark/run-records-test-support";
import { CliTestWorkspace, recordOutput } from "#cli/cli-test-support";
import runDiagnose from "#cli/diagnose-command";

import DiagnoseRequestBuilder from "./diagnose-request-test-builder";

const workspace = CliTestWorkspace.forEachTest();

const STORED_SPEND_CEILING_USD = 30;

async function printsNothingAndLeavesTheExitToTheStop(): Promise<void> {
	const directory = await workspace.createDirectory("rehearse-diagnose-");
	await runStoppedAtBuild(directory);
	const recorder = recordOutput();
	const call = new StoppableAnalysisCall();
	const diagnosing = runDiagnose(
		new DiagnoseRequestBuilder({ runsDirectory: directory }).build(),
		{
			invokerFor: () => call.invoke,
			liveness: nothingRunning,
			now: () => new Date("2026-10-04T12:00:00.000Z"),
			output: recorder.output,
			requireSpendCeiling: async () =>
				await Promise.resolve(STORED_SPEND_CEILING_USD),
			stopOnSignal: call.stopOnSignal,
		},
	);

	await liftingRefusal(async () => {
		await call.stopDuringCall("SIGINT");
	});
	await diagnosing;

	expect(recorder.stdout).toEqual([]);
}

describe(runDiagnose.name, () => {
	describe("when a stop ends the call", () => {
		it(
			"prints nothing and leaves the exit to the stop",
			printsNothingAndLeavesTheExitToTheStop,
		);
	});
});
