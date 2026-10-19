import { describe, expect, it } from "bun:test";
import { dirname } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import { RefusedPreconditionError } from "./exit-codes";
import { runReplay } from "./replay";
import ReplayConfirmationHarness from "./replay-confirmation-test-support";
import ReplaySavedRunBuilder from "./replay-saved-run-test-builder";
import {
	ReplayRequestBuilder,
	SERVED,
	SERVED_TARGET,
} from "./replay-test-fixtures";
import { TestResources } from "./test-support";

const FIRST_CREATED_WORKTREE_INDEX = 0;

const testResources = TestResources.forEachTest();
const setsUpItsWorktreeAgainstServicesStartedForIt =
	async (): Promise<void> => {
		const run = await new ReplaySavedRunBuilder({
			target: SERVED_TARGET,
		}).build(testResources);
		const fake = new ReplayConfirmationHarness();

		await runReplay(
			fake.dependencies,
			new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
		);

		const [observedFirstWorktree] = fake.worktrees;

		expect(fake.setups).toEqual([
			{
				setup: [{ command: ["bun", "install"], env: SERVED }],
				targetDir: observedFirstWorktree?.path ?? "missing",
			},
		]);
	};
const givesItsStageSessionAndTreatmentChecksTheServices =
	async (): Promise<void> => {
		const run = await new ReplaySavedRunBuilder({
			target: SERVED_TARGET,
		}).build(testResources);
		const fake = new ReplayConfirmationHarness();

		await runReplay(
			fake.dependencies,
			new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
		);

		expect(fake.sessionEnvironments).toEqual([SERVED]);
		expect(fake.targetChecks).toEqual([
			[{ command: ["bun", "test"], env: SERVED }],
		]);
	};
const removesItsContainersOnceItEnds = async (): Promise<void> => {
	const run = await new ReplaySavedRunBuilder({ target: SERVED_TARGET }).build(
		testResources,
	);
	const fake = new ReplayConfirmationHarness();

	await runReplay(
		fake.dependencies,
		new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
	);

	expect(fake.containers.runningServices()).toEqual([]);
};
const removesItsContainersWhenItFails = async (): Promise<void> => {
	const run = await new ReplaySavedRunBuilder({ target: SERVED_TARGET }).build(
		testResources,
	);
	const fake = new ReplayConfirmationHarness();
	const failing = {
		...fake.dependencies,
		runStageJudge: async () => await Promise.reject(new Error("judge died")),
	};

	await failureOf(
		runReplay(
			failing,
			new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
		),
	);

	expect(fake.containers.runningServices()).toEqual([]);
	testResources.track(
		dirname(fake.worktrees[FIRST_CREATED_WORKTREE_INDEX]?.path ?? "missing"),
	);
};
const startsNoneForAPlanningStageWhichRunsNo = async (): Promise<void> => {
	const run = await new ReplaySavedRunBuilder({ target: SERVED_TARGET }).build(
		testResources,
	);
	const fake = new ReplayConfirmationHarness();

	await runReplay(
		fake.dependencies,
		new ReplayRequestBuilder({ stage: "discuss" }).build(run.paths),
	);

	expect(fake.setups).toEqual([]);
	expect(fake.containers.readinessCommands("postgres")).toEqual([]);
};
const refusesTheReplay = async (): Promise<void> => {
	const run = await new ReplaySavedRunBuilder({ target: SERVED_TARGET }).build(
		testResources,
	);
	const fake = new ReplayConfirmationHarness();
	fake.containers.failToStart("postgres");

	const failure = await failureOf(
		runReplay(
			fake.dependencies,
			new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(fake.setups).toEqual([]);
	testResources.track(
		dirname(fake.worktrees[FIRST_CREATED_WORKTREE_INDEX]?.path ?? "missing"),
	);
};
describe(runReplay.name, () => {
	describe("when the run's target declares services", () => {
		it(
			"sets up its worktree against services started for it",
			setsUpItsWorktreeAgainstServicesStartedForIt,
		);
		it(
			"gives its stage session and treatment checks the services its setup ran against",
			givesItsStageSessionAndTreatmentChecksTheServices,
		);
		it("removes its containers once it ends", removesItsContainersOnceItEnds);
		it("removes its containers when it fails", removesItsContainersWhenItFails);
		it(
			"starts none for a planning stage, which runs no setup",
			startsNoneForAPlanningStageWhichRunsNo,
		);
		describe("when a service cannot start", () => {
			it("refuses the replay", refusesTheReplay);
		});
	});
});
