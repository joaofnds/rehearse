import { describe, expect, it } from "bun:test";

import { ReplayError, loadRunCheckpoints, resolveReplay } from "./replay";
import ReplayLineageFixtureBuilder from "./replay-lineage-test-builder";
import { writeReplayCheckpointDirectory } from "./replay-saved-run-test-builder";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();
const loadsEveryRecordedCheckpointByItsStageName = async (): Promise<void> => {
	const runDirectory = await writeReplayCheckpointDirectory(testResources);

	const observedCheckpoints = await loadRunCheckpoints(runDirectory);

	expect([...observedCheckpoints.keys()].toSorted()).toEqual([
		"discuss",
		"initial",
	]);
	expect(observedCheckpoints.get("discuss")?.stage).toBe("discuss");
};
const consumesThePrecedingStagesCheckpointAndCarriesEarlierArtifacts =
	(): void => {
		const plan = resolveReplay(
			new ReplayLineageFixtureBuilder().build().manifest,
			new ReplayLineageFixtureBuilder().build().checkpoints,
			"build",
		);

		expect(plan.definition.name).toBe("build");
		expect(plan.consumed.stage).toBe("plan");
		expect(plan.consumed.lineage).toBe("lin-2");
		expect(plan.priorArtifacts.map(({ path }) => path)).toEqual([
			"backlog/docs/DOC-1 - spec.md",
			"backlog/docs/DOC-2 - plan.md",
		]);
	};
const replaysTheFirstStageFromTheInitialCheckpoint = (): void => {
	const plan = resolveReplay(
		new ReplayLineageFixtureBuilder().build().manifest,
		new ReplayLineageFixtureBuilder().build().checkpoints,
		"discuss",
	);

	expect(plan.consumed.stage).toBe("initial");
	expect(plan.priorArtifacts).toEqual([]);
};
const namesTheMissingInitialCheckpointOnARunThat = (): void => {
	const stale = new ReplayLineageFixtureBuilder().build().checkpoints;
	stale.delete("initial");

	expect(() =>
		resolveReplay(
			new ReplayLineageFixtureBuilder().build().manifest,
			stale,
			"discuss",
		),
	).toThrow(/no initial checkpoint/u);
};
const refusesAStageTheRunsPipelineNeverDeclared = (): void => {
	expect(() =>
		resolveReplay(
			new ReplayLineageFixtureBuilder().build().manifest,
			new ReplayLineageFixtureBuilder().build().checkpoints,
			"grill",
		),
	).toThrow(/discuss, plan, build/u);
};
const refusesToReplayPastThePointTheRunReached = (): void => {
	const partial = new ReplayLineageFixtureBuilder().build().checkpoints;
	partial.delete("plan");

	expect(() =>
		resolveReplay(
			new ReplayLineageFixtureBuilder().build().manifest,
			partial,
			"build",
		),
	).toThrow(/no checkpoint for the plan stage/u);
};
const refusesACheckpointChainThatDoesNotLinkBack = (): void => {
	const forged = new ReplayLineageFixtureBuilder().build().checkpoints;
	forged.set("plan", {
		artifacts: [],
		corpusFiles: [],
		lineage: "lin-2",
		model: "sonnet",
		stage: "plan",
		targetSha: "task-sha",
		upstream: "lin-forged",
		workflowState: [],
	});

	expect(() =>
		resolveReplay(
			new ReplayLineageFixtureBuilder().build().manifest,
			forged,
			"build",
		),
	).toThrow(
		new ReplayError(
			"The run's checkpoint chain is broken at the plan stage: it consumed lin-forged, but discuss produced lin-1",
		),
	);
};
const carriesTheWholeConsumedChainInOrderForStaleness = (): void => {
	const plan = resolveReplay(
		new ReplayLineageFixtureBuilder().build().manifest,
		new ReplayLineageFixtureBuilder().build().checkpoints,
		"build",
	);

	expect(plan.chain.map(({ stage }) => stage)).toEqual([
		"initial",
		"discuss",
		"plan",
	]);
};
const carriesOnlyTheInitialCheckpointWhenReplayingTheFirst = (): void => {
	const plan = resolveReplay(
		new ReplayLineageFixtureBuilder().build().manifest,
		new ReplayLineageFixtureBuilder().build().checkpoints,
		"discuss",
	);

	expect(plan.chain.map(({ stage }) => stage)).toEqual(["initial"]);
};
describe(loadRunCheckpoints.name, () => {
	it(
		"loads every recorded checkpoint by its stage name",
		loadsEveryRecordedCheckpointByItsStageName,
	);
});
describe(resolveReplay.name, () => {
	it(
		"consumes the preceding stage's checkpoint and carries earlier artifacts",
		consumesThePrecedingStagesCheckpointAndCarriesEarlierArtifacts,
	);
	it(
		"replays the first stage from the initial checkpoint",
		replaysTheFirstStageFromTheInitialCheckpoint,
	);
	it(
		"names the missing initial checkpoint on a run that predates it",
		namesTheMissingInitialCheckpointOnARunThat,
	);
	it(
		"refuses a stage the run's pipeline never declared",
		refusesAStageTheRunsPipelineNeverDeclared,
	);
	it(
		"refuses to replay past the point the run reached",
		refusesToReplayPastThePointTheRunReached,
	);
	it(
		"refuses a checkpoint chain that does not link back to the root",
		refusesACheckpointChainThatDoesNotLinkBack,
	);
	it(
		"carries the whole consumed chain, in order, for staleness",
		carriesTheWholeConsumedChainInOrderForStaleness,
	);
	it(
		"carries only the initial checkpoint when replaying the first stage",
		carriesOnlyTheInitialCheckpointWhenReplayingTheFirst,
	);
});
