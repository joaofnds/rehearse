import { describe, expect, it } from "bun:test";

import { commandOutcome, liftingRefusal } from "./command-refusal-test-probe";
import type { CommandOutcome } from "./command-refusal-test-probe";
import type { AnalysisInvoker } from "./root-cause-analysis";
import { analyzeRun } from "./root-cause-analysis";
import { FakeAnalysisProvider } from "./root-cause-analysis-provider-test-fixtures";
import RecordWriterProbe from "./root-cause-analysis-record-writer-probe";
import StoppableAnalysisCall from "./root-cause-analysis-stop-test-fixture";
import {
	dependencies,
	registerAnalysisFixtureCleanup,
	runsDirectory,
} from "./root-cause-analysis-test-environment";
import { RUN, runStoppedAtBuild } from "./root-cause-analysis-test-support";

registerAnalysisFixtureCleanup();

const STARTED_AT = "2026-10-04T12:00:00.000Z";

async function keepsTheStopAsTheRecordOfACallStoppedWhileItRuns(): Promise<void> {
	const directory = await runsDirectory();
	await runStoppedAtBuild(directory);
	const call = new StoppableAnalysisCall();

	const analysis = analyzeRun(
		{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
		{ ...dependencies(call.invoke), stopOnSignal: call.stopOnSignal },
	);
	await liftingRefusal(async () => {
		await call.stopDuringCall("SIGINT");
	});
	const { file, stopped } = await analysis;

	expect(stopped).toBe(true);
	expect(await Bun.file(file).json()).toMatchObject({
		capUsd: 1,
		outcome: "failed",
		reason:
			"stopped by SIGINT before its outcome was recorded; what the call spent is unknown, and it is capped at $1",
		startedAt: STARTED_AT,
	});
}
async function keepsTheOutcomeOfACallThatSettledBeforeTheStop(): Promise<void> {
	const directory = await runsDirectory();
	await runStoppedAtBuild(directory);
	const call = new StoppableAnalysisCall();
	const records = new RecordWriterProbe();
	records.runOnceAfterReplace(async () => {
		await call.installed().recordStop("SIGTERM");
	});

	const { file, stopped } = await liftingRefusal(
		async () =>
			await analyzeRun(
				{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
				{
					...dependencies(new FakeAnalysisProvider().invoke),
					records,
					stopOnSignal: call.stopOnSignal,
				},
			),
	);

	expect(stopped).toBe(false);
	expect(await Bun.file(file).json()).toMatchObject({
		costUsd: 0.24,
		outcome: "recorded",
	});
}
async function waitsForTheOutcomeOfACallThatSettledAsTheStopArrived(): Promise<void> {
	const directory = await runsDirectory();
	await runStoppedAtBuild(directory);
	const call = new StoppableAnalysisCall();
	const records = new RecordWriterProbe();
	const order: string[] = [];
	let stopping: Promise<void> = Promise.resolve();
	records.runOnceBeforeReplace(() => {
		stopping = (async () => {
			const callbacks = call.installed();
			await callbacks.recordStop("SIGINT");
			await callbacks.cleanUp();
			order.push("stop cleaned up");
		})();
	});
	records.runOnceAfterReplace(async () => {
		order.push("outcome written");
		await Promise.resolve();
	});

	await liftingRefusal(async () => {
		await analyzeRun(
			{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
			{
				...dependencies(new FakeAnalysisProvider().invoke),
				records,
				stopOnSignal: call.stopOnSignal,
			},
		);
		await stopping;
	});

	expect(order).toEqual(["outcome written", "stop cleaned up"]);
}
async function refusesTheCommandsOfACallWhoseStopBeganBeforeItSpawned(): Promise<void> {
	const directory = await runsDirectory();
	await runStoppedAtBuild(directory);
	const call = new StoppableAnalysisCall();
	const outcomes: CommandOutcome[] = [];
	const invoke: AnalysisInvoker = async () => {
		await call.installed().recordStop("SIGINT");
		outcomes.push(await commandOutcome());

		return await Promise.reject(new Error("The call was refused"));
	};

	await liftingRefusal(
		async () =>
			await analyzeRun(
				{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
				{ ...dependencies(invoke), stopOnSignal: call.stopOnSignal },
			),
	);

	expect(outcomes).toEqual(["refused"]);
}
describe(analyzeRun.name, () => {
	describe("when a stop arrives during the call", () => {
		it(
			"keeps the stop as the call's record",
			keepsTheStopAsTheRecordOfACallStoppedWhileItRuns,
		);
	});
	describe("when a stop arrives before the call spawns", () => {
		it(
			"refuses the call's commands",
			refusesTheCommandsOfACallWhoseStopBeganBeforeItSpawned,
		);
	});
	describe("when a stop arrives after the call settled", () => {
		it(
			"keeps the call's outcome with its cost",
			keepsTheOutcomeOfACallThatSettledBeforeTheStop,
		);
	});
	describe("when a stop arrives while the outcome is written", () => {
		it(
			"waits for the outcome before the process exits",
			waitsForTheOutcomeOfACallThatSettledAsTheStopArrived,
		);
	});
});
