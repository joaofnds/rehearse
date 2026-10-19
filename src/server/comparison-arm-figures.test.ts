import { describe, expect, it } from "bun:test";

import type { OutputWords } from "#benchmark/output-words";
import ReliabilitySummaryBuilder from "#server/comparison-quality-test-fixture";
import ComparisonSourceRepBuilder from "#server/comparison-source-rep-test-builder";
import ComparisonSourceBuilder from "#server/comparison-source-test-builder";

import type { ArmWords } from "./comparison-arm-figures";
import { NO_RECORDED_WORDS_REASON, armFigures } from "./comparison-arm-figures";
import { NO_GRADED_REP_REASON } from "./confirmation-group-summary";

const ORDINAL_BASE = 1;

const lettersEverywhere = () => "letters" as const;

const unavailableCost = {
	completeReps: 0,
	missingEvidence: [{ missing: ["worker cost"], ordinal: 1, repId: "rep-1" }],
	missingMetricReps: 1,
	status: "UNAVAILABLE",
} as const;

function wordsOf(words: readonly (OutputWords | undefined)[]): ArmWords {
	return armFigures(
		{
			quality: [],
			resources: unavailableCost,
			source: new ComparisonSourceBuilder({
				reps: words.map((count, index) =>
					new ComparisonSourceRepBuilder({
						ordinal: index + ORDINAL_BASE,
						path: `rep-${index + ORDINAL_BASE}.json`,
						repId: `rep-${index + ORDINAL_BASE}`,
						words: count,
					}).build(),
				),
			}).build(),
		},
		lettersEverywhere,
	).words;
}

describe(armFigures.name, () => {
	it(
		"reads cost as unavailable, naming each rep that lacks it",
		verifyArmFiguresNameReadsCostAsUnavailableNamingEachRepThatLacksIt,
	);

	it(
		"counts a rep that never reached the measure as a failed attempt",
		verifyArmFiguresNameCountsARepThatNeverReachedTheMeasureAsAFailedAttempt,
	);

	it(
		"counts the graded attempts its median is taken over",
		verifyArmFiguresNameCountsTheGradedAttemptsItsMedianIsTakenOver,
	);

	it(
		"reads a stage no rep was graded at as unavailable rather than a letter",
		verifyArmFiguresNameReadsAStageNoRepWasGradedAtAsUnavailableRatherThanALetter,
	);

	describe("average words", () => {
		it(
			"averages the words of the attempts that recorded a count",
			verifyArmFiguresNameAverageWordsAveragesTheWordsOfTheAttemptsThatRecordedACount,
		);

		it(
			"reads unavailable with each rep's reason when no attempt has a count",
			verifyArmFiguresNameAverageWordsReadsUnavailableWithEachRepSReasonWhenNoAttemptHasACount,
		);

		it(
			"reads unavailable, not zero, for a report written before word counts",
			verifyArmFiguresNameAverageWordsReadsUnavailableNotZeroForAReportWrittenBeforeWordCounts,
		);
	});
});

function verifyArmFiguresNameReadsCostAsUnavailableNamingEachRepThatLacksIt(): void {
	const gradeDistribution = Object.fromEntries(
		[{ count: 4, grade: "C" }].map(({ grade, count }) => [grade, count]),
	);
	const figures = armFigures(
		{
			quality: [new ReliabilitySummaryBuilder({ gradeDistribution }).build()],
			resources: {
				completeReps: 2,
				missingEvidence: [
					{ missing: ["worker cost"], ordinal: 2, repId: "rep-2" },
					{
						missing: ["worker cost", "stage-judge cost"],
						ordinal: 4,
						repId: "rep-4",
					},
				],
				missingMetricReps: 2,
				status: "UNAVAILABLE",
			},
			source: new ComparisonSourceBuilder().build(),
		},
		lettersEverywhere,
	);

	expect(figures.cost).toEqual({
		reasons: [
			"rep-2 lacks worker cost",
			"rep-4 lacks worker cost, stage-judge cost",
		],
		state: "unavailable",
	});
}

function verifyArmFiguresNameCountsARepThatNeverReachedTheMeasureAsAFailedAttempt(): void {
	const figures = armFigures(
		{
			quality: [
				{
					...new ReliabilitySummaryBuilder({
						gradeDistribution: { FAIL: 0, PASS: 2 },
					}).build(),
					attempted: 2,
					failed: 2,
					name: "final",
					notReached: 2,
					successful: 2,
				},
			],
			resources: {
				completeReps: 0,
				missingEvidence: [
					{ missing: ["worker cost"], ordinal: 1, repId: "rep-1" },
				],
				missingMetricReps: 4,
				status: "UNAVAILABLE",
			},
			source: new ComparisonSourceBuilder().build(),
		},
		() => "successRate",
	);

	expect(figures.measures["final"]).toEqual({
		attempts: 4,
		scale: "successRate",
		successful: 2,
	});
}

function verifyArmFiguresNameCountsTheGradedAttemptsItsMedianIsTakenOver(): void {
	const gradeDistribution = Object.fromEntries(
		[
			{ count: 2, grade: "B" },
			{ count: 1, grade: "C" },
		].map(({ grade, count }) => [grade, count]),
	);
	const figures = armFigures(
		{
			quality: [new ReliabilitySummaryBuilder({ gradeDistribution }).build()],
			resources: unavailableCost,
			source: new ComparisonSourceBuilder().build(),
		},
		lettersEverywhere,
	);

	expect(figures.measures["build"]).toEqual({
		grades: {
			graded: 3,
			highest: "B",
			lowest: "C",
			median: "B",
			state: "available",
		},
		scale: "letters",
	});
}

function verifyArmFiguresNameReadsAStageNoRepWasGradedAtAsUnavailableRatherThanALetter(): void {
	const figures = armFigures(
		{
			quality: [new ReliabilitySummaryBuilder().build()],
			resources: {
				completeReps: 0,
				missingEvidence: [
					{ missing: ["worker cost"], ordinal: 1, repId: "rep-1" },
				],
				missingMetricReps: 4,
				status: "UNAVAILABLE",
			},
			source: new ComparisonSourceBuilder().build(),
		},
		lettersEverywhere,
	);

	expect(figures.measures["build"]).toEqual({
		grades: { reasons: [NO_GRADED_REP_REASON], state: "unavailable" },
		scale: "letters",
	});
}

function verifyArmFiguresNameAverageWordsAveragesTheWordsOfTheAttemptsThatRecordedACount(): void {
	expect(
		wordsOf([
			{ state: "available", words: 10 },
			{ state: "available", words: 21 },
			{ reason: "the attempt recorded no reply", state: "unavailable" },
		]),
	).toEqual({
		attempts: 3,
		averageWords: 15.5,
		counted: 2,
		state: "available",
	});
}

function verifyArmFiguresNameAverageWordsReadsUnavailableWithEachRepSReasonWhenNoAttemptHasACount(): void {
	expect(
		wordsOf([
			{ reason: "the attempt recorded no reply", state: "unavailable" },
			{ reason: "the stage's only output is a diff", state: "unavailable" },
		]),
	).toEqual({
		reasons: [
			"rep-1: the attempt recorded no reply",
			"rep-2: the stage's only output is a diff",
		],
		state: "unavailable",
	});
}

function verifyArmFiguresNameAverageWordsReadsUnavailableNotZeroForAReportWrittenBeforeWordCounts(): void {
	expect(wordsOf([undefined, undefined])).toEqual({
		reasons: [NO_RECORDED_WORDS_REASON],
		state: "unavailable",
	});
}
