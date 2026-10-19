import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";

import { gradeBuild } from "#benchmark/comparison-grading-evidence-test-fixtures";
import {
	clearComparisonRoots,
	oneCheckpointComparison,
	writtenFixture,
} from "#server/comparison-endpoint-test-fixture";
import {
	leaveOneBaselineAttemptUnreached,
	rewriteFixtureAsSession,
} from "#server/comparison-report-modes-test-fixture";
import { comparisonResponseFrom } from "#server/comparison-response-test-schema";
import ComparisonHarness from "#server/comparison-test-harness";

afterEach(clearComparisonRoots);

function registerTests(harness: Promise<ComparisonHarness>): void {
	describe("What moved", () => {
		describe("summary", () => {
			registerWhatMovedSummaryComparesArmBWithArmAAndEachWithTheBaselineArmOverEveryCombinationOfTheirAttempts(
				harness,
			);

			registerWhatMovedSummaryGivesTheReplyLengthChangeFromArmAToArmBWithItsReading(
				harness,
			);

			registerWhatMovedSummaryStatesWhatAsManyAttemptsAgainPerArmWouldCostAtEachArmSRecordedCostPerAttempt(
				harness,
			);

			registerWhatMovedSummaryComparesASessionSSuccessesAgainstItsFailuresOverEveryCombinationOfAttempts(
				harness,
			);
		});
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

function registerWhatMovedSummaryComparesArmBWithArmAAndEachWithTheBaselineArmOverEveryCombinationOfTheirAttempts(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"compares arm B with arm A and each with the baseline arm over every combination of their attempts",
		verifyWhatMovedSummaryComparesArmBWithArmAAndEachWithTheBaselineArmOverEveryCombinationOfTheirAttempts,
	);
	async function verifyWhatMovedSummaryComparesArmBWithArmAAndEachWithTheBaselineArmOverEveryCombinationOfTheirAttempts(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const digest = await oneCheckpointComparison(
			runsDirectory,
			async (fixture) => {
				await gradeBuild(fixture, "baseline", ["C", "B"]);
				await gradeBuild(fixture, "candidate", ["A", "B"]);
				await gradeBuild(fixture, "control", ["D", "D"]);
			},
		);

		const { summary } = await driver.comparison(digest);

		expect(summary["build-checkpoint"]).toMatchObject({
			contrasts: {
				baselineMinusControl: {
					build: {
						combinations: { equal: 0, higher: 4, lower: 0, of: 4 },
						verdict: { arm: "baseline", kind: "separated" },
					},
				},
				candidateMinusBaseline: {
					build: {
						combinations: {
							equal: 1,
							higher: 3,
							lower: 0,
							of: 4,
							state: "available",
						},
						verdict: { kind: "insideRerunNoise" },
					},
				},
				candidateMinusControl: {
					build: {
						combinations: { equal: 0, higher: 4, lower: 0, of: 4 },
						verdict: { arm: "candidate", kind: "separated" },
					},
				},
			},
		});
	}
}

function registerWhatMovedSummaryGivesTheReplyLengthChangeFromArmAToArmBWithItsReading(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"gives the reply-length change from arm A to arm B with its reading",
		verifyWhatMovedSummaryGivesTheReplyLengthChangeFromArmAToArmBWithItsReading,
	);
	async function verifyWhatMovedSummaryGivesTheReplyLengthChangeFromArmAToArmBWithItsReading(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const digest = await oneCheckpointComparison(runsDirectory);

		const { summary } = await driver.comparison(digest);

		expect(summary["build-checkpoint"]?.["replyLength"]).toEqual({
			change: "-53%",
			interval: {
				minuend: { high: 4, low: 3 },
				subtrahend: { high: 8, low: 7 },
			},
			verdict: { kind: "insideRerunNoise" },
		});
	}
}

function registerWhatMovedSummaryStatesWhatAsManyAttemptsAgainPerArmWouldCostAtEachArmSRecordedCostPerAttempt(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"states what as many attempts again per arm would cost at each arm's recorded cost per attempt",
		verifyWhatMovedSummaryStatesWhatAsManyAttemptsAgainPerArmWouldCostAtEachArmSRecordedCostPerAttempt,
	);
	async function verifyWhatMovedSummaryStatesWhatAsManyAttemptsAgainPerArmWouldCostAtEachArmSRecordedCostPerAttempt(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const digest = await oneCheckpointComparison(runsDirectory);

		const { summary } = await driver.comparison(digest);

		expect(summary["build-checkpoint"]?.["moreAttempts"]).toEqual({
			attemptsPerArm: 2,
			state: "available",
			usd: 9,
		});
	}
}

function registerWhatMovedSummaryComparesASessionSSuccessesAgainstItsFailuresOverEveryCombinationOfAttempts(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"compares a session's successes against its failures over every combination of attempts",
		verifyWhatMovedSummaryComparesASessionSSuccessesAgainstItsFailuresOverEveryCombinationOfAttempts,
	);
	async function verifyWhatMovedSummaryComparesASessionSSuccessesAgainstItsFailuresOverEveryCombinationOfAttempts(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const fixture = await writtenFixture(runsDirectory);
		await rewriteFixtureAsSession(fixture);
		await leaveOneBaselineAttemptUnreached(fixture);

		const body = await comparisonResponseFrom(
			await driver.comparisonRaw(fixture.comparisonDigest),
		);

		expect(body.summary["case-1"]).toMatchObject({
			contrasts: {
				candidateMinusBaseline: {
					checks: {
						combinations: {
							equal: 8,
							higher: 8,
							lower: 0,
							of: 16,
							state: "available",
						},
					},
				},
			},
		});
	}
}
