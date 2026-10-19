import { describe, expect, it } from "bun:test";

import { failureOf } from "#cli/cli-test-support";

import runReplayConfirmation from "./replay-confirmation";
import ReplayConfirmationFixtureBuilder from "./replay-confirmation-fixture-builder";
import {
	ReplayServiceAddresses,
	SERVED_TARGET,
	servedInputs,
} from "./replay-confirmation-service-test-fixtures";
import { TestResources } from "./test-support";

const INITIAL_SETUP_CALL_INDEX = 0;

const FIRST_STOP_REQUEST_INDEX = 0;

const expectedSize = 3;
const testResources = TestResources.forEachTest();
const setsUpEachRepAgainstServicesStartedForItAlone =
	async (): Promise<void> => {
		const { harness: fake, run } = await new ReplayConfirmationFixtureBuilder({
			discussCorpus: [],
			target: SERVED_TARGET,
		}).build(testResources);

		const { dependencies: replayDependencies, request: replayRequest } =
			fake.prepareConfirmation(await servedInputs(run.paths, testResources), {
				stage: "build",
			});

		await runReplayConfirmation(replayDependencies, replayRequest);

		expect(
			fake.setups
				.map(({ setup }) =>
					String(setup?.[INITIAL_SETUP_CALL_INDEX]?.env?.["DATABASE_URL"]),
				)
				.toSorted((left, right) => left.localeCompare(right)),
		).toEqual([
			"postgres://127.0.0.1:49152/app",
			"postgres://127.0.0.1:49153/app",
			"postgres://127.0.0.1:49154/app",
		]);
	};

const givesEachRepsStageSessionAndTreatmentChecksTheServices =
	async (): Promise<void> => {
		const { harness: fake, run } = await new ReplayConfirmationFixtureBuilder({
			discussCorpus: [],
			target: SERVED_TARGET,
		}).build(testResources);
		const addressesFake = new ReplayServiceAddresses();

		const { dependencies: replayDependencies, request: replayRequest } =
			fake.prepareConfirmation(
				await servedInputs(run.paths, testResources),
				{ stage: "build" },
				addressesFake.override,
			);

		await runReplayConfirmation(replayDependencies, replayRequest);

		const addresses = fake.setups.map(({ targetDir, setup }) => ({
			checks: addressesFake.checks.get(targetDir),
			session: addressesFake.session.get(targetDir),
			setup: setup?.[INITIAL_SETUP_CALL_INDEX]?.env?.["DATABASE_URL"],
		}));

		expect(addresses).toEqual(
			addresses.map(({ setup }) => ({
				checks: setup,
				session: setup,
				setup,
			})),
		);
		expect(new Set(addresses.map(({ setup }) => setup)).size).toBe(
			expectedSize,
		);
	};

const removesEveryContainerItsRepsStartedOnceTheyEnd =
	async (): Promise<void> => {
		const { harness: fake, run } = await new ReplayConfirmationFixtureBuilder({
			discussCorpus: [],
			target: SERVED_TARGET,
		}).build(testResources);

		const { dependencies: replayDependencies, request: replayRequest } =
			fake.prepareConfirmation(await servedInputs(run.paths, testResources), {
				stage: "build",
			});

		await runReplayConfirmation(replayDependencies, replayRequest);

		expect(fake.containers.runningServices()).toEqual([]);
	};

const removesTheContainersOfEveryRepStillRunning = async (): Promise<void> => {
	const { harness: fake, run } = await new ReplayConfirmationFixtureBuilder({
		discussCorpus: [],
		target: SERVED_TARGET,
	}).build(testResources);
	let running: readonly string[] = ["the stop never ran"];

	const { dependencies: replayDependencies, request: replayRequest } =
		fake.prepareConfirmation(
			await servedInputs(run.paths, testResources),
			{ stage: "build" },
			(defaults) => ({
				...defaults,
				runStageJudge: async () => {
					await fake.stops[FIRST_STOP_REQUEST_INDEX]?.();
					running = fake.containers.runningServices();

					throw new Error("the stop killed this rep's judge");
				},
			}),
		);

	await failureOf(runReplayConfirmation(replayDependencies, replayRequest));

	expect(running).toEqual([]);
};
describe(runReplayConfirmation.name, () => {
	describe("when the run's target declares services", () => {
		it(
			"sets up each rep against services started for it alone",
			setsUpEachRepAgainstServicesStartedForItAlone,
		);

		it(
			"gives each rep's stage session and treatment checks the services its setup ran against",
			givesEachRepsStageSessionAndTreatmentChecksTheServices,
		);

		it(
			"removes every container its reps started once they end",
			removesEveryContainerItsRepsStartedOnceTheyEnd,
		);

		describe("when a signal stops it", () => {
			it(
				"removes the containers of every rep still running",
				removesTheContainersOfEveryRepStillRunning,
			);
		});
	});
});
