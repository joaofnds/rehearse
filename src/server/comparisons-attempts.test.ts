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
import type { ComparisonResponse } from "#server/comparison-response-test-schema";
import ComparisonHarness from "#server/comparison-test-harness";

const EXPECTED_REPLY_LENGTH = {
	arms: {
		baseline: {
			counted: 2,
			high: 8,
			low: 7,
			mean: 7.5,
			state: "available",
		},
		candidate: {
			counted: 2,
			high: 4,
			low: 3,
			mean: 3.5,
			state: "available",
		},
	},
	readings: {
		candidateMinusBaseline: {
			change: "-53%",
			verdict: { kind: "insideRerunNoise" },
		},
	},
};

afterEach(clearComparisonRoots);

function registerTests(harness: Promise<ComparisonHarness>): void {
	describe("What moved", () => {
		registerWhatMovedServesEachArmSAverageWordsFromTheWordsItsRepsRecorded(
			harness,
		);

		registerWhatMovedSpreadsReplyLengthAndCostPerAttemptAcrossEachArmSAttemptsReadingTwoApartAttemptsAnArmAsRerunNoise(
			harness,
		);

		registerWhatMovedListsEachArmSRecordedAttemptsSideBySideByOrdinalClaimingNoPairingBetweenArms(
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

function registerWhatMovedServesEachArmSAverageWordsFromTheWordsItsRepsRecorded(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"serves each arm's average words from the words its reps recorded",
		verifyWhatMovedServesEachArmSAverageWordsFromTheWordsItsRepsRecorded,
	);
	async function verifyWhatMovedServesEachArmSAverageWordsFromTheWordsItsRepsRecorded(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const digest = await oneCheckpointComparison(runsDirectory);

		const { armFigures } = await driver.comparison(digest);

		expect(armFigures["build-checkpoint"]?.["candidate"]?.words).toEqual({
			attempts: 2,
			averageWords: 3.5,
			counted: 2,
			state: "available",
		});
	}
}

function registerWhatMovedSpreadsReplyLengthAndCostPerAttemptAcrossEachArmSAttemptsReadingTwoApartAttemptsAnArmAsRerunNoise(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"spreads reply length and cost per attempt across each arm's attempts, reading two apart attempts an arm as rerun noise",
		verifyWhatMovedSpreadsReplyLengthAndCostPerAttemptAcrossEachArmSAttemptsReadingTwoApartAttemptsAnArmAsRerunNoise,
	);
	async function verifyWhatMovedSpreadsReplyLengthAndCostPerAttemptAcrossEachArmSAttemptsReadingTwoApartAttemptsAnArmAsRerunNoise(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const digest = await oneCheckpointComparison(runsDirectory);

		const { whatMoved: rows } = await driver.comparison(digest);
		const meter = (
			name: string,
		): ComparisonResponse["whatMoved"][string][number] | undefined =>
			rows["build-checkpoint"]?.find((row) => row.name === name);

		expect(meter("replyLength")).toMatchObject(EXPECTED_REPLY_LENGTH);
		expect(meter("costPerAttempt")).toMatchObject({
			arms: {
				candidate: { high: 2, low: 1, mean: 1.5, state: "available" },
			},
			readings: {
				candidateMinusBaseline: {
					interval: {
						minuend: { high: 2, low: 1 },
						subtrahend: { high: 2, low: 1 },
					},
				},
			},
		});
	}
}

function registerWhatMovedListsEachArmSRecordedAttemptsSideBySideByOrdinalClaimingNoPairingBetweenArms(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"lists each arm's recorded attempts side by side by ordinal, claiming no pairing between arms",
		verifyWhatMovedListsEachArmSRecordedAttemptsSideBySideByOrdinalClaimingNoPairingBetweenArms,
	);
	async function verifyWhatMovedListsEachArmSRecordedAttemptsSideBySideByOrdinalClaimingNoPairingBetweenArms(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const digest = await oneCheckpointComparison(runsDirectory);

		const { attempts } = await driver.comparison(digest);
		const byArm = attempts["build-checkpoint"];

		expect(
			byArm?.candidate.map(({ ordinal, words }) => ({ ordinal, words })),
		).toEqual([
			{ ordinal: 1, words: { state: "available", words: 3 } },
			{ ordinal: 2, words: { state: "available", words: 4 } },
		]);
		expect(byArm?.baseline.map(({ repId }) => repId)).toEqual([
			"build-checkpoint-baseline-rep-1",
			"build-checkpoint-baseline-rep-2",
		]);
		expect(
			[
				...(byArm?.baseline ?? []),
				...(byArm?.candidate ?? []),
				...(byArm?.control ?? []),
			].map((attempt) => Object.keys(attempt).toSorted()),
		).toEqual(
			Array.from({ length: 6 }, () => [
				"blockersFired",
				"ordinal",
				"outcomes",
				"repId",
				"words",
			]),
		);
	}
}
