import { describe, expect, it } from "bun:test";

import { liftingRefusal } from "#benchmark/command-refusal-test-probe";
import { GroupStoppedError } from "#benchmark/confirmation-evidence";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { TestResources } from "#benchmark/test-support";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import { executeSessionRun, runRunCommand } from "#cli/run-command";

import {
	FIRST_STOP_REQUEST_INDEX,
	missingPreflight,
	resumedSmokeCase,
	sessionMetrics,
} from "./run-command-test-fixture";
import CitationStop from "./session-citation-stop-test-fixture";
import {
	SessionRequestBuilder,
	recordSuccessfulSessionAttempt,
	sessionCommandDependencies,
	sessionConfirmationState,
	writtenRepRecords,
} from "./session-command-test-boundaries";

const testResources = TestResources.forEachTest();

/** A two-rep confirmation group the operator stops as its first rep starts. */
async function stoppedConfirmationGroup(runsDirectory: string): Promise<Error> {
	const { output } = recordOutput();
	const stops: (() => Promise<void>)[] = [];

	const dependencies = sessionCommandDependencies({
		executeSession: async (execution, boundary) =>
			await executeSessionRun(execution, {
				...boundary,
				executeAttempt: async (plan) => {
					await stops[FIRST_STOP_REQUEST_INDEX]?.();
					return await recordSuccessfulSessionAttempt(plan);
				},
				runsDirectory,
				stopOnSignal: (cleanUp, recordStop) => {
					stops.push(async () => {
						await recordStop("SIGTERM");
						await cleanUp();
					});

					return () => {
						stops.length = 0;
					};
				},
			}),
		output,
		probeModel: async () =>
			await Promise.resolve({
				call: { metrics: sessionMetrics },
				status: "COMPLETE" as const,
			}),
	});
	return await liftingRefusal(
		async () =>
			await failureOf(
				runRunCommand(
					new SessionRequestBuilder({}, [
						"--confirm",
						"--reps",
						"2",
						"--yes",
					]).build(),
					dependencies,
				),
			),
	);
}

async function recordsAStoppedConfirmationGroupSOperatorStopAnd(): Promise<void> {
	const runsDirectory = await testResources.createControlDirectory();

	const failure = await stoppedConfirmationGroup(runsDirectory);

	expect(failure).toBeInstanceOf(GroupStoppedError);
	expect(await sessionConfirmationState(runsDirectory)).toEqual({
		hasSummary: false,
		operatorStopped: true,
	});
}

async function writesNoRepRecordOnceTheOperatorStopIsRecorded(): Promise<void> {
	const runsDirectory = await testResources.createControlDirectory();

	await stoppedConfirmationGroup(runsDirectory);

	expect(await writtenRepRecords(runsDirectory)).toEqual([]);
}

/**
 * The sessions a two-rep confirmation group starts when the operator stops it
 * while both reps await the live citation map, before either starts its
 * session.
 */
async function sessionsOfAGroupStoppedBeforeItsReps(
	runsDirectory: string,
): Promise<readonly string[]> {
	const citations = new CitationStop();

	const dependencies = sessionCommandDependencies({
		executeSession: async (execution, boundary) =>
			await executeSessionRun(execution, {
				...boundary,
				preparedSession: citations.boundary,
				runsDirectory,
				stopOnSignal: (cleanUp, recordStop) => {
					citations.stops.push(async () => {
						await recordStop("SIGTERM");
						await cleanUp();
					});

					return () => {
						citations.stops.length = 0;
					};
				},
			}),
		output: recordOutput().output,
	});
	await liftingRefusal(
		async () =>
			await failureOf(
				runRunCommand(
					new SessionRequestBuilder({}, [
						"--confirm",
						"--reps",
						"2",
						"--yes",
					]).build(),
					dependencies,
				),
			),
	);

	return citations.sessions;
}

async function startsNoRepSessionOnceTheOperatorStopsTheGroup(): Promise<void> {
	const runsDirectory = await testResources.createControlDirectory();

	const sessions = await sessionsOfAGroupStoppedBeforeItsReps(runsDirectory);

	expect(sessions).toEqual([]);
}

async function refusesAnUnsupportedResumedConfirmationBeforeItsModelProbe(): Promise<void> {
	const { output } = recordOutput();
	const paidCalls: string[] = [];

	const dependencies = sessionCommandDependencies({
		executeSession: async (execution, boundary) =>
			await executeSessionRun(execution, {
				...boundary,
				assertSystemPromptSnapshotSupported: async () => {
					await Promise.reject(
						new RefusedPreconditionError(
							"Claude does not support prompt snapshot control",
						),
					);
				},
				executeAttempt: async () => {
					paidCalls.push("rep");

					return await Promise.reject(new Error("must not run"));
				},
			}),
		output,
		probeModel: async () => {
			paidCalls.push("probe");

			return await Promise.resolve(missingPreflight);
		},
		requireCase: async () => await Promise.resolve(resumedSmokeCase),
	});
	const failure = await failureOf(
		runRunCommand(
			new SessionRequestBuilder({}, [
				"--confirm",
				"--reps",
				"2",
				"--yes",
			]).build(),
			dependencies,
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(paidCalls).toEqual([]);
}

describe("runRunCommand for a session case", () => {
	it(
		"records a stopped confirmation group's operator stop and writes no group record",
		recordsAStoppedConfirmationGroupSOperatorStopAnd,
	);
	it(
		"writes no rep record once the operator stop is recorded",
		writesNoRepRecordOnceTheOperatorStopIsRecorded,
	);
	it(
		"starts no rep's session once the operator stops the group",
		startsNoRepSessionOnceTheOperatorStopsTheGroup,
	);
	it(
		"refuses an unsupported resumed confirmation before its model probe and reps",
		refusesAnUnsupportedResumedConfirmationBeforeItsModelProbe,
	);
});
