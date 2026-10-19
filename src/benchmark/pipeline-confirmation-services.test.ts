import { describe, expect, it } from "bun:test";
import { basename } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import { RefusedPreconditionError } from "./exit-codes";
import runPipelineConfirmation from "./pipeline-confirmation";
import PipelineServicesProbe from "./pipeline-confirmation-services-test-probe";
import {
	PipelineConfirmationHarness,
	SERVED_CONFIRMATION_PIPELINE,
} from "./pipeline-confirmation-test-support";
import { TestResources } from "./test-support";

const FIRST_RECORDED_CHECK_INDEX = 0;

const INITIAL_SETUP_CALL_INDEX = 0;

const testResources = TestResources.forEachTest();

async function setsUpAndChecksEachWorktreeAgainstServicesStartedForItAlone(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const setupAddresses: (string | undefined)[] = [];
	const checkAddresses: (string | undefined)[] = [];

	await harness.run(
		{ pipeline: SERVED_CONFIRMATION_PIPELINE },
		(dependencies) => ({
			...dependencies,
			runChecks: async (_targetDir, { checks }) => {
				checkAddresses.push(
					checks[FIRST_RECORDED_CHECK_INDEX]?.env?.["DATABASE_URL"],
				);

				await Promise.resolve();
			},
			runSetup: async (_targetDir, setup) => {
				setupAddresses.push(
					setup?.[INITIAL_SETUP_CALL_INDEX]?.env?.["DATABASE_URL"],
				);

				await Promise.resolve();
			},
		}),
	);

	expect(
		setupAddresses.toSorted((left, right) =>
			String(left).localeCompare(String(right)),
		),
	).toEqual([
		"postgres://127.0.0.1:49152/app",
		"postgres://127.0.0.1:49153/app",
		"postgres://127.0.0.1:49154/app",
		"postgres://127.0.0.1:49155/app",
	]);
	expect(checkAddresses).toEqual(["postgres://127.0.0.1:49152/app"]);
}

async function givesEachRepSStageSessionsAndTreatmentChecksTheServicesItsSetupRanAgainst(): Promise<void> {
	const expectedSize = 3;

	const harness = await PipelineConfirmationHarness.setup(testResources);
	const probe = new PipelineServicesProbe();

	await harness.run({ pipeline: SERVED_CONFIRMATION_PIPELINE }, probe.override);
	const addresses = probe.addresses();

	expect(addresses).toEqual(
		addresses.map(({ setup }) => ({
			checks: setup,
			sessions: [setup],
			setup,
		})),
	);
	expect(new Set(addresses.map(({ setup }) => setup)).size).toBe(expectedSize);
}

async function removesEveryContainerItStartedOnceItsRepsEnd(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);

	await harness.run({ pipeline: SERVED_CONFIRMATION_PIPELINE });

	expect(harness.containers.runningServices()).toEqual([]);
}

async function removesThatRepSContainers(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);

	await harness.run(
		{ pipeline: SERVED_CONFIRMATION_PIPELINE },
		(dependencies) => ({
			...dependencies,
			runSetup: async (targetDir) => {
				await (basename(targetDir).includes("-rep-")
					? Promise.reject(new Error("migration failed"))
					: Promise.resolve());
			},
		}),
	);

	expect(harness.containers.runningServices()).toEqual([]);
}

async function refusesBeforeAnyRepRuns(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	harness.containers.failToStart("postgres");
	const setupDirectories: string[] = [];

	const failure = await failureOf(
		harness.run({ pipeline: SERVED_CONFIRMATION_PIPELINE }, (dependencies) => ({
			...dependencies,
			runSetup: async (targetDir) => {
				setupDirectories.push(targetDir);

				await Promise.resolve();
			},
		})),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(setupDirectories).toEqual([]);
}

describe(runPipelineConfirmation.name, () => {
	describe("when each repetition owns its target services", () => {
		it(
			"sets up and checks each worktree against services started for it alone",
			setsUpAndChecksEachWorktreeAgainstServicesStartedForItAlone,
		);
		it(
			"gives each rep's stage sessions and treatment checks the services its setup ran against",
			givesEachRepSStageSessionsAndTreatmentChecksTheServicesItsSetupRanAgainst,
		);
		it(
			"removes every container it started once its reps end",
			removesEveryContainerItStartedOnceItsRepsEnd,
		);
		describe("when a rep's setup fails", () => {
			it("removes that rep's containers", removesThatRepSContainers);
		});
		describe("when a service cannot start for the group's setup", () => {
			it("refuses before any rep runs", refusesBeforeAnyRepRuns);
		});
	});
});
