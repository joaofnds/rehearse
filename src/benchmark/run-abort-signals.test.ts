import { describe, expect, it } from "bun:test";

import type { SignalStopHandler } from "./process-signals";
import { createRunAbort, fileRunArtifactPersistence } from "./run-abort";
import { openSignalHarness } from "./run-abort-signal-test-harness";
import StageJudgeInputBuilder from "./run-abort-stage-input-builder";
import RunAbortBuilder from "./run-abort-test-builder";
import { TestResources } from "./test-support";

const EXPECTED_RECOVERY_CALLS = 1;

const testResources = TestResources.forEachTest();

function testRegistersAndReleasesTheSupportedSignalHandlers(): void {
	const registered: {
		signal: NodeJS.Signals;
		handler: SignalStopHandler;
	}[] = [];
	const released: typeof registered = [];
	const abort = new RunAbortBuilder({
		dependencies: {
			persistence: fileRunArtifactPersistence,
			registerSignal: (signal, handler) => {
				registered.push({ handler, signal });
			},
			releaseSignal: (signal, handler) => {
				released.push({ handler, signal });
			},
		},
		request: {
			artifactFile: "/tmp/run.json",
			operatorStopFile: "/tmp/operator-stop.json",
		},
	}).build();

	abort.release();

	expect(registered.map(({ signal }) => signal)).toEqual([
		"SIGINT",
		"SIGTERM",
		"SIGHUP",
	]);
	expect(released).toEqual(registered);
}

async function testKillsCommandsRecordsTheInterruptionRestoresAndReturnsTheSignalCode(): Promise<void> {
	const harness = await openSignalHarness(testResources, {
		inspectStageAtTeardown: true,
	});

	harness.abort.updatePendingStage({
		file: harness.stageFile,
		input: new StageJudgeInputBuilder({ stage: "shape" }).build(),
		stage: "shape",
	});

	const stopped = harness.emit("SIGTERM");

	expect(harness.effects).toEqual(["kill"]);
	expect(await stopped).toEqual({ code: 143, kind: "stopped" });
	expect(harness.effects).toEqual(["kill", "teardown"]);
	expect(harness.evidencePresentAtTeardown).toBe(true);
	expect(JSON.parse(await Bun.file(harness.stageFile).text())).toMatchObject({
		error: "run interrupted by SIGTERM",
		operatorStop: { signal: "SIGTERM" },
		status: "STAGE_JUDGE_FAILED",
	});
	expect(harness.diagnostics).toEqual([
		"\nReceived SIGTERM; removing the run's checkout before exit.",
	]);
}

async function testRecordsTheOperatorStopWhenTheSignalArrivesBeforeAnyStageIsJudged(): Promise<void> {
	const harness = await openSignalHarness(testResources, {});
	const stopped = await harness.emit("SIGINT");

	expect(stopped).toEqual({ code: 130, kind: "stopped" });
	expect(JSON.parse(await Bun.file(harness.operatorStopFile).text())).toEqual({
		signal: "SIGINT",
		status: "OPERATOR_STOPPED",
	});
	expect(harness.diagnostics).toEqual([
		"\nReceived SIGINT; removing the run's checkout before exit.",
	]);
}

async function testRecordsEvidenceAndRestoresWhenCommandCancellationFails(): Promise<void> {
	const harness = await openSignalHarness(testResources, {
		failCancellation: true,
	});

	harness.abort.updatePendingStage({
		file: harness.stageFile,
		input: new StageJudgeInputBuilder({ stage: "shape" }).build(),
		stage: "shape",
	});

	await harness.emit("SIGTERM");

	expect(harness.teardownCalls).toBe(EXPECTED_RECOVERY_CALLS);
	expect(JSON.parse(await Bun.file(harness.stageFile).text())).toMatchObject({
		error: "run interrupted by SIGTERM",
		status: "STAGE_JUDGE_FAILED",
	});
	expect(harness.diagnostics).toEqual([
		"\nReceived SIGTERM; removing the run's checkout before exit.",
		"kill failed",
	]);
}

async function testLatchesRepeatedSignalsWhileRecoveryIsRunning(): Promise<void> {
	const harness = await openSignalHarness(testResources, {
		artifactFile: "/tmp/run.json",
		holdCancellation: true,
	});
	const firstStop = harness.emit("SIGINT");
	const repeatedStop = harness.emit("SIGTERM");

	harness.releaseCancellation();

	const outcomes = await Promise.all([firstStop, repeatedStop]);

	expect(harness.cancellationCalls).toBe(EXPECTED_RECOVERY_CALLS);
	expect(harness.teardownCalls).toBe(EXPECTED_RECOVERY_CALLS);
	expect(outcomes).toEqual([
		{ code: 130, kind: "stopped" },
		{ kind: "ignored" },
	]);
	expect(harness.diagnostics).toEqual([
		"\nReceived SIGINT; removing the run's checkout before exit.",
		"\nReceived SIGTERM; removing the run's checkout before exit.",
	]);
}

describe(createRunAbort.name, () => {
	describe("when the operator interrupts the run", () => {
		it(
			"registers and releases the supported signal handlers",
			testRegistersAndReleasesTheSupportedSignalHandlers,
		);
		it(
			"kills commands, records the interruption, restores, and returns the signal code",
			testKillsCommandsRecordsTheInterruptionRestoresAndReturnsTheSignalCode,
		);
		it(
			"records the operator stop when the signal arrives before any stage is judged",
			testRecordsTheOperatorStopWhenTheSignalArrivesBeforeAnyStageIsJudged,
		);
		it(
			"records evidence and restores when command cancellation fails",
			testRecordsEvidenceAndRestoresWhenCommandCancellationFails,
		);
		it(
			"latches repeated signals while recovery is running",
			testLatchesRepeatedSignalsWhileRecoveryIsRunning,
		);
	});
});
