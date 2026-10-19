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
	writtenFixture,
} from "#server/comparison-endpoint-test-fixture";
import {
	JUDGE_AGREEMENT_COMPARISON_REPORT_VERSION,
	LEGACY_COMPARISON_REPORT_VERSION,
	rewriteFixtureAsLegacyPipeline,
	rewriteFixtureAsSession,
} from "#server/comparison-report-modes-test-fixture";
import ComparisonHarness from "#server/comparison-test-harness";

import { NO_RECORDED_WORDS_REASON } from "./comparison-arm-figures";

const EXPECTED_LEGACY_CONTROL = {
	cost: { perAttemptUsd: 2.5, state: "available", totalUsd: 10 },
	measures: {
		build: {
			grades: {
				graded: 4,
				highest: "D",
				lowest: "D",
				median: "D",
				state: "available",
			},
			scale: "letters",
		},
		discuss: {
			grades: {
				graded: 4,
				highest: "D",
				lowest: "D",
				median: "D",
				state: "available",
			},
			scale: "letters",
		},
		final: { attempts: 4, scale: "successRate", successful: 0 },
	},
	words: {
		reasons: [NO_RECORDED_WORDS_REASON],
		state: "unavailable",
	},
};

afterEach(clearComparisonRoots);

function registerTests(harness: Promise<ComparisonHarness>): void {
	describe("arm figures", () => {
		registerGETApiComparisonsDigestArmFiguresGivesEachArmItsMedianAndRangePerStageItsFinalSuccessesItsCostAndNoWordCountFromAReportWhoseRepsCarryNone(
			harness,
		);

		registerGETApiComparisonsDigestArmFiguresGivesASessionArmItsSuccessesOfAttemptsAndNoLetter(
			harness,
		);

		registerLegacyArmFigures(harness);
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

function registerGETApiComparisonsDigestArmFiguresGivesEachArmItsMedianAndRangePerStageItsFinalSuccessesItsCostAndNoWordCountFromAReportWhoseRepsCarryNone(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"gives each arm its median and range per stage, its final successes, its cost, and no word count from a report whose reps carry none",
		verifyGETApiComparisonsDigestArmFiguresGivesEachArmItsMedianAndRangePerStageItsFinalSuccessesItsCostAndNoWordCountFromAReportWhoseRepsCarryNone,
	);
	async function verifyGETApiComparisonsDigestArmFiguresGivesEachArmItsMedianAndRangePerStageItsFinalSuccessesItsCostAndNoWordCountFromAReportWhoseRepsCarryNone(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const fixture = await writtenFixture(runsDirectory);

		const { armFigures: figures } = await driver.comparison(
			fixture.comparisonDigest,
		);

		expect(figures["case-1"]?.["baseline"]).toEqual({
			cost: { perAttemptUsd: 2.5, state: "available", totalUsd: 10 },
			measures: {
				build: {
					grades: {
						graded: 4,
						highest: "A",
						lowest: "D",
						median: "D",
						state: "available",
					},
					scale: "letters",
				},
				discuss: {
					grades: {
						graded: 4,
						highest: "A",
						lowest: "D",
						median: "D",
						state: "available",
					},
					scale: "letters",
				},
				final: { attempts: 4, scale: "successRate", successful: 2 },
			},
			words: {
				reasons: [NO_RECORDED_WORDS_REASON],
				state: "unavailable",
			},
		});
	}
}

function registerGETApiComparisonsDigestArmFiguresGivesASessionArmItsSuccessesOfAttemptsAndNoLetter(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"gives a session arm its successes of attempts and no letter",
		verifyGETApiComparisonsDigestArmFiguresGivesASessionArmItsSuccessesOfAttemptsAndNoLetter,
	);
	async function verifyGETApiComparisonsDigestArmFiguresGivesASessionArmItsSuccessesOfAttemptsAndNoLetter(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const fixture = await writtenFixture(runsDirectory);
		await rewriteFixtureAsSession(fixture);

		const { armFigures: figures } = await driver.comparison(
			fixture.comparisonDigest,
		);

		expect(figures["case-1"]?.["candidate"]?.measures).toEqual({
			checks: { attempts: 4, scale: "successRate", successful: 4 },
		});
	}
}

function registerLegacyArmFigures(harness: Promise<ComparisonHarness>): void {
	it.each(
		(
			[
				LEGACY_COMPARISON_REPORT_VERSION,
				JUDGE_AGREEMENT_COMPARISON_REPORT_VERSION,
			] as const
		).map((version) => [version] as const),
	)("reads a version-%i report's arms", verifyLegacyArmFigures);
	async function verifyLegacyArmFigures(
		version:
			| typeof LEGACY_COMPARISON_REPORT_VERSION
			| typeof JUDGE_AGREEMENT_COMPARISON_REPORT_VERSION,
	): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const fixture = await writtenFixture(runsDirectory);
		await rewriteFixtureAsLegacyPipeline(fixture, version);

		const { armFigures: figures } = await driver.comparison(
			fixture.comparisonDigest,
		);

		expect(figures["case-2"]?.["control"]).toEqual(EXPECTED_LEGACY_CONTROL);
	}
}
