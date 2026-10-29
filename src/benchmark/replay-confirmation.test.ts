import { describe, expect, it } from "bun:test";

import { projectConfirmationCost } from "./confirmation";
import { parseConfirmationGroupRecord } from "./confirmation-record";
import runReplayConfirmation from "./replay-confirmation";
import ReplayCorpusBuilder from "./replay-confirmation-corpus-test-builder";
import ReplayConfirmationFixtureBuilder from "./replay-confirmation-fixture-builder";
import { readShortIds } from "./short-id";
import { TestResources } from "./test-support";

const CLOCK_READ_COUNT_INCREMENT = 1;

const expectedSpendCeilingUsd = 12;
const CLOCK_DAY = 8;
const CLOCK_HOUR = 10;
const CLOCK_MINUTE = 15;
const CLOCK_MINUTES_PER_READ = 10;
const CLOCK_MONTH_INDEX = 9;
const CLOCK_YEAR = 2026;
const testResources = TestResources.forEachTest();

const recordsOnTheGroupTheSpendCeilingEachRepRan = async (): Promise<void> => {
	const { harness, run } = await new ReplayConfirmationFixtureBuilder().build(
		testResources,
	);
	const corpusRoot = await new ReplayCorpusBuilder().build(testResources);

	const { dependencies: replayDependencies, request: replayRequest } =
		harness.prepareConfirmation(
			{
				corpusRoots: [{ kind: "directory", root: corpusRoot }],
				paths: run.paths,
			},
			{ reps: 2, spendCeilingUsd: 12 },
		);

	const outcome = await runReplayConfirmation(
		replayDependencies,
		replayRequest,
	);
	const group = parseConfirmationGroupRecord(
		await Bun.file(outcome.groupRecordFile).text(),
	);

	expect(group.inputs.spendCeilingUsd).toBe(expectedSpendCeilingUsd);
	// The frozen input hash is an independent d020bf3a byte golden.
	const pipeline = group.inputs.files.find(({ kind }) => kind === "pipeline");
	expect(pipeline?.sha256).toBe(
		"b25ff2734c2cb07c17a2f4d3d2b3e9813e06f35402137c034945669b18298711",
	);
};

const recordsTheCeilingHeldProjectionWithNoKeyBeyondTheProjection =
	async (): Promise<void> => {
		const { harness, run } = await new ReplayConfirmationFixtureBuilder().build(
			testResources,
		);
		const corpusRoot = await new ReplayCorpusBuilder().build(testResources);
		const ceiling = { reps: 2, sessionBudgetUsd: 5, spendCeilingUsd: 6 };
		const { dependencies: replayDependencies, request: replayRequest } =
			harness.prepareConfirmation(
				{
					corpusRoots: [{ kind: "directory", root: corpusRoot }],
					paths: run.paths,
				},
				{
					...ceiling,
					projectedCost: projectConfirmationCost({ ...ceiling, mode: "stage" }),
				},
			);

		const outcome = await runReplayConfirmation(
			replayDependencies,
			replayRequest,
		);

		const group = parseConfirmationGroupRecord(
			await Bun.file(outcome.groupRecordFile).text(),
		);
		expect(group.projectedCost).toEqual({
			perRepMaximumUsd: 6,
			reps: 2,
			totalMaximumUsd: 12,
		});
	};

const recordsOnTheGroupTheInstantItsRepsStarted = async (): Promise<void> => {
	const { harness, run } = await new ReplayConfirmationFixtureBuilder().build(
		testResources,
	);
	const corpusRoot = await new ReplayCorpusBuilder().build(testResources);
	// The wall clock reads ten minutes later each time the makespan's clock
	// is read, so a start time read after the reps began names a later minute.

	let reads = 0;
	const now = (): number => {
		reads += CLOCK_READ_COUNT_INCREMENT;

		return reads;
	};
	const wallClock = (): number =>
		Date.UTC(
			CLOCK_YEAR,
			CLOCK_MONTH_INDEX,
			CLOCK_DAY,
			CLOCK_HOUR,
			CLOCK_MINUTE + CLOCK_MINUTES_PER_READ * reads,
		);

	const { dependencies: replayDependencies, request: replayRequest } =
		harness.prepareConfirmation(
			{
				corpusRoots: [{ kind: "directory", root: corpusRoot }],
				paths: run.paths,
			},
			{ now, reps: 2, wallClock },
		);

	const outcome = await runReplayConfirmation(
		replayDependencies,
		replayRequest,
	);

	const group = parseConfirmationGroupRecord(
		await Bun.file(outcome.groupRecordFile).text(),
	);

	expect(group.startedAt).toBe("2026-10-08T10:15:00.000Z");
};

const claimsTheGroupAShortIdInItsSourceRuns = async (): Promise<void> => {
	const { harness, run } = await new ReplayConfirmationFixtureBuilder().build(
		testResources,
	);
	const corpusRoot = await new ReplayCorpusBuilder().build(testResources);

	const { dependencies: replayDependencies, request: replayRequest } =
		harness.prepareConfirmation(
			{
				corpusRoots: [{ kind: "directory", root: corpusRoot }],
				paths: run.paths,
			},
			{ reps: 2 },
		);

	const outcome = await runReplayConfirmation(
		replayDependencies,
		replayRequest,
	);
	const group = parseConfirmationGroupRecord(
		await Bun.file(outcome.groupRecordFile).text(),
	);

	expect(await readShortIds(run.paths.runsDirectory, "audit-log")).toEqual([
		{
			record: {
				groupId: group.groupId,
				kind: "group",
				source: { run: run.paths.name, stage: "discuss" },
			},
			shortId: "audit-log/g1",
		},
	]);
};

describe(runReplayConfirmation.name, () => {
	describe("group records", () => {
		it(
			"records the ceiling-held projection with no key beyond the projection",
			recordsTheCeilingHeldProjectionWithNoKeyBeyondTheProjection,
		);

		it(
			"records on the group the spend ceiling each rep ran under",
			recordsOnTheGroupTheSpendCeilingEachRepRan,
		);

		it(
			"records on the group the instant its reps started",
			recordsOnTheGroupTheInstantItsRepsStarted,
		);

		it(
			"claims the group a short id in its source run's case",
			claimsTheGroupAShortIdInItsSourceRuns,
		);
	});
});
