import { describe, expect, it } from "bun:test";

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

describe("runRunCommand for a session case", () => {
	it(
		"records a debug session attempt under the records directory it was given",
		recordsADebugSessionAttemptUnderTheRecordsDirectory,
	);
	it(
		"holds a stop on the signals while its attempt runs",
		holdsAStopOnTheSignalsWhileItsAttempt,
	);
});
