import { describe, expect, it } from "bun:test";

import { liftingRefusal } from "#benchmark/command-refusal-test-probe";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import { executeSessionRun, runRunCommand } from "#cli/run-command";

import { missingPreflight, resumedSmokeCase } from "./run-command-test-fixture";
import {
	SessionRequestBuilder,
	sessionCommandDependencies,
} from "./session-command-test-boundaries";

async function recordsADebugSessionAttemptUnderTheRecordsDirectory(): Promise<void> {
	const { output } = recordOutput();
	const recordedUnder: string[] = [];

	const dependencies = sessionCommandDependencies({
		executeSession: async (execution, boundary) =>
			await executeSessionRun(execution, {
				...boundary,
				assertSystemPromptSnapshotSupported: async () => {
					await Promise.resolve();
				},
				runDebug: async (request) => {
					recordedUnder.push(request.runsDirectory);

					return await Promise.reject(new Error("attempt reached"));
				},
				runsDirectory: "/given/records",
			}),
		output,
		probeModel: async () => await Promise.resolve(missingPreflight),
		requireCase: async () => await Promise.resolve(resumedSmokeCase),
	});
	await failureOf(
		runRunCommand(new SessionRequestBuilder({}, []).build(), dependencies),
	);

	expect(recordedUnder).toEqual(["/given/records"]);
}

async function holdsAStopOnTheSignalsWhileItsAttempt(): Promise<void> {
	const { output } = recordOutput();
	const events: string[] = [];

	const dependencies = sessionCommandDependencies({
		executeSession: async (execution, boundary) =>
			await executeSessionRun(execution, {
				...boundary,
				assertSystemPromptSnapshotSupported: async () => {
					await Promise.resolve();
				},
				runDebug: async () => {
					events.push("attempt");

					return await Promise.reject(new Error("attempt reached"));
				},
				stopOnSignal: () => {
					events.push("stop held");

					return () => {
						events.push("stop released");
					};
				},
			}),
		output,
		probeModel: async () => await Promise.resolve(missingPreflight),
		requireCase: async () => await Promise.resolve(resumedSmokeCase),
	});
	await failureOf(
		runRunCommand(new SessionRequestBuilder({}, []).build(), dependencies),
	);

	expect(events).toEqual(["stop held", "attempt", "stop released"]);
}

const RECORD_WRITE_MS = 10;

async function makesAnOperatorStopWaitForTheDebugAttemptItRuns(): Promise<void> {
	const { output } = recordOutput();
	let stop: (() => Promise<void>) | undefined = undefined;
	let recordWritten = false;
	let writtenWhenTheStopReturned = false;

	const dependencies = sessionCommandDependencies({
		executeSession: async (execution, boundary) =>
			await executeSessionRun(execution, {
				...boundary,
				assertSystemPromptSnapshotSupported: async () => {
					await Promise.resolve();
				},
				runDebug: async (request) => {
					const attempt = request.inFlight.track(async () => {
						await Bun.sleep(RECORD_WRITE_MS);
						recordWritten = true;
					});
					await stop?.();
					writtenWhenTheStopReturned = recordWritten;
					await attempt;

					return await Promise.reject(new Error("attempt stopped"));
				},
				stopOnSignal: (cleanUp, recordStop) => {
					stop = async () => {
						await recordStop("SIGTERM");
						await cleanUp();
					};

					return () => {
						stop = undefined;
					};
				},
			}),
		output,
		probeModel: async () => await Promise.resolve(missingPreflight),
		requireCase: async () => await Promise.resolve(resumedSmokeCase),
	});
	await liftingRefusal(
		async () =>
			await failureOf(
				runRunCommand(new SessionRequestBuilder({}, []).build(), dependencies),
			),
	);

	expect(writtenWhenTheStopReturned).toBe(true);
}

describe("runRunCommand for a session case", () => {
	it(
		"records a debug session attempt under the records directory it was given",
		recordsADebugSessionAttemptUnderTheRecordsDirectory,
	);
	it(
		"holds a stop on the signals while its attempt runs",
		holdsAStopOnTheSignalsWhileItsAttempt,
	);
	it(
		"makes an operator stop wait for the debug attempt it runs",
		makesAnOperatorStopWaitForTheDebugAttemptItRuns,
	);
});
