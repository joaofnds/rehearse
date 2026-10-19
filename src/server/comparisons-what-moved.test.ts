import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";

import {
	clearComparisonRoots,
	oneCheckpointComparison,
} from "#server/comparison-endpoint-test-fixture";
import ComparisonHarness from "#server/comparison-test-harness";

afterEach(clearComparisonRoots);

function registerTests(harness: Promise<ComparisonHarness>): void {
	describe("What moved", () => {
		registerWhatMovedRefusesAttributionAndNamesEveryPathWhenTheArmsDifferInMoreThanOne(
			harness,
		);

		registerWhatMovedRowsAOneCheckpointStageComparisonByOverallBlockerDimensionAndMeter(
			harness,
		);

		registerWhatMovedCountsAHardBlockerSFiringsOfTheRepsGradedOnItWithAReadingPerArmPair(
			harness,
		);

		registerWhatMovedReadsADimensionWhoseLetterSpansDoNotOverlapAsSeparated(
			harness,
		);
	});
}

describe("GET /api/comparisons/:digest", () => {
	const harness = Promise.withResolvers<ComparisonHarness>();
	beforeAll(async () => {
		await ComparisonHarness.setup().then(harness.resolve, harness.reject);
	});
	beforeEach(async () => {
		const ready = await harness.promise;
		await ready.reset();
	});
	afterAll(async () => {
		const ready = await harness.promise;
		await ready.teardown();
	});
	registerTests(harness.promise);
});

function registerWhatMovedRefusesAttributionAndNamesEveryPathWhenTheArmsDifferInMoreThanOne(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"refuses attribution and names every path when the arms differ in more than one",
		verifyWhatMovedRefusesAttributionAndNamesEveryPathWhenTheArmsDifferInMoreThanOne,
	);
	async function verifyWhatMovedRefusesAttributionAndNamesEveryPathWhenTheArmsDifferInMoreThanOne(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const digest = await oneCheckpointComparison(
			runsDirectory,
			async (fixture) => {
				await fixture.addCorpusFile("build-checkpoint", "candidate", {
					content: "candidate reference\n",
					path: "inputs/corpus/build/reference.md",
				});
			},
		);

		const { attribution } = await driver.comparison(digest);

		expect(attribution["build-checkpoint"]?.["candidateMinusBaseline"]).toEqual(
			{
				claim: "refused",
				differingPaths: ["SKILL.md", "reference.md"],
			},
		);
	}
}

function registerWhatMovedRowsAOneCheckpointStageComparisonByOverallBlockerDimensionAndMeter(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"rows a one-checkpoint stage comparison by overall, blocker, dimension and meter",
		verifyWhatMovedRowsAOneCheckpointStageComparisonByOverallBlockerDimensionAndMeter,
	);
	async function verifyWhatMovedRowsAOneCheckpointStageComparisonByOverallBlockerDimensionAndMeter(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const digest = await oneCheckpointComparison(runsDirectory);

		const { whatMoved: rows } = await driver.comparison(digest);

		expect(
			rows["build-checkpoint"]?.map(({ kind, name }) => `${kind} ${name}`),
		).toEqual([
			"overall build",
			"hardBlocker scope-declared",
			"dimension clarity",
			"meter replyLength",
			"meter costPerAttempt",
		]);
	}
}

function registerWhatMovedCountsAHardBlockerSFiringsOfTheRepsGradedOnItWithAReadingPerArmPair(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"counts a hard blocker's firings of the reps graded on it, with a reading per arm pair",
		verifyWhatMovedCountsAHardBlockerSFiringsOfTheRepsGradedOnItWithAReadingPerArmPair,
	);
	async function verifyWhatMovedCountsAHardBlockerSFiringsOfTheRepsGradedOnItWithAReadingPerArmPair(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const digest = await oneCheckpointComparison(runsDirectory);

		const { whatMoved: rows } = await driver.comparison(digest);
		const blocker = rows["build-checkpoint"]?.find(
			({ kind }) => kind === "hardBlocker",
		);

		expect(blocker).toMatchObject({
			arms: {
				baseline: { fired: 2, of: 2, state: "available" },
				candidate: { fired: 0, of: 2, state: "available" },
			},
			readings: {
				candidateMinusBaseline: {
					interval: {
						minuend: { high: "66%", low: "0%" },
						subtrahend: { high: "100%", low: "34%" },
					},
					verdict: { kind: "insideRerunNoise" },
				},
				candidateMinusControl: { verdict: { kind: "unchangedAlreadyClear" } },
			},
			stage: "build",
		});
	}
}

function registerWhatMovedReadsADimensionWhoseLetterSpansDoNotOverlapAsSeparated(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"reads a dimension whose letter spans do not overlap as separated",
		verifyWhatMovedReadsADimensionWhoseLetterSpansDoNotOverlapAsSeparated,
	);
	async function verifyWhatMovedReadsADimensionWhoseLetterSpansDoNotOverlapAsSeparated(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const digest = await oneCheckpointComparison(runsDirectory);

		const { whatMoved: rows } = await driver.comparison(digest);
		const dimension = rows["build-checkpoint"]?.find(
			({ kind }) => kind === "dimension",
		);

		expect(dimension).toMatchObject({
			arms: {
				baseline: { median: "C", state: "available" },
				candidate: { graded: 2, median: "A", state: "available" },
			},
			readings: {
				candidateMinusBaseline: {
					interval: {
						minuend: { high: "A", low: "A" },
						subtrahend: { high: "C", low: "C" },
					},
					verdict: { arm: "candidate", kind: "separated" },
				},
			},
		});
	}
}
