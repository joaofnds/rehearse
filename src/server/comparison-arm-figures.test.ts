import { describe, expect, it } from "bun:test";
import type { ReliabilitySummary } from "#benchmark/confirmation-report";
import type { OutputWords } from "#benchmark/output-words";
import type { ArmWords } from "./comparison-arm-figures";
import { armFigures, NO_RECORDED_WORDS_REASON } from "./comparison-arm-figures";
import { NO_GRADED_REP_REASON } from "./confirmation-group-summary";

function buildSummary(
	gradeDistribution: Readonly<Record<string, number>>,
): ReliabilitySummary {
	return {
		name: "build",
		requested: 4,
		attempted: 4,
		notReached: 0,
		failed: 4,
		successful: 0,
		gradeDistribution,
		successRate: 0,
		standardError: 0,
		passK: 0,
	};
}

const lettersEverywhere = () => "letters" as const;

const unavailableCost = {
	status: "UNAVAILABLE",
	completeReps: 0,
	missingMetricReps: 1,
	missingEvidence: [{ repId: "rep-1", ordinal: 1, missing: ["worker cost"] }],
} as const;

type ArmSource = Parameters<typeof armFigures>[0]["source"];
type ArmSourceRep = ArmSource["reps"][number];

function repWith(index: number, words: OutputWords | undefined): ArmSourceRep {
	const rep = {
		repId: `rep-${String(index + 1)}`,
		ordinal: index + 1,
		path: `rep-${String(index + 1)}.json`,
		sha256: "b".repeat(64),
		attempt: { path: "attempt.json", sha256: "c".repeat(64) },
		outcomes: [
			{ name: "checks", status: "JUDGED", grade: "A", successful: true },
		],
	} as const;
	if (words === undefined) {
		return rep;
	}

	return { ...rep, words };
}

function sourceOf(words: readonly (OutputWords | undefined)[]): ArmSource {
	return {
		group: { path: "group.json", sha256: "a".repeat(64) },
		reps: words.map((count, index) => repWith(index, count)),
	};
}

function wordsOf(words: readonly (OutputWords | undefined)[]): ArmWords {
	return armFigures(
		{ quality: [], source: sourceOf(words), resources: unavailableCost },
		lettersEverywhere,
	).words;
}

describe(armFigures.name, () => {
	it("reads cost as unavailable, naming each rep that lacks it", () => {
		const figures = armFigures(
			{
				quality: [buildSummary(Object.fromEntries([["C", 4]]))],
				source: sourceOf([]),
				resources: {
					status: "UNAVAILABLE",
					completeReps: 2,
					missingMetricReps: 2,
					missingEvidence: [
						{ repId: "rep-2", ordinal: 2, missing: ["worker cost"] },
						{
							repId: "rep-4",
							ordinal: 4,
							missing: ["worker cost", "stage-judge cost"],
						},
					],
				},
			},
			lettersEverywhere,
		);

		expect(figures.cost).toEqual({
			state: "unavailable",
			reasons: [
				"rep-2 lacks worker cost",
				"rep-4 lacks worker cost, stage-judge cost",
			],
		});
	});

	it("counts a rep that never reached the measure as a failed attempt", () => {
		const figures = armFigures(
			{
				quality: [
					{
						...buildSummary({ PASS: 2, FAIL: 0 }),
						name: "final",
						attempted: 2,
						notReached: 2,
						failed: 2,
						successful: 2,
					},
				],
				source: sourceOf([]),
				resources: {
					status: "UNAVAILABLE",
					completeReps: 0,
					missingMetricReps: 4,
					missingEvidence: [
						{ repId: "rep-1", ordinal: 1, missing: ["worker cost"] },
					],
				},
			},
			() => "successRate",
		);

		expect(figures.measures["final"]).toEqual({
			scale: "successRate",
			successful: 2,
			attempts: 4,
		});
	});

	it("counts the graded attempts its median is taken over", () => {
		const figures = armFigures(
			{
				quality: [
					buildSummary(
						Object.fromEntries([
							["B", 2],
							["C", 1],
						]),
					),
				],
				source: sourceOf([]),
				resources: unavailableCost,
			},
			lettersEverywhere,
		);

		expect(figures.measures["build"]).toEqual({
			scale: "letters",
			grades: {
				state: "available",
				median: "B",
				lowest: "C",
				highest: "B",
				graded: 3,
			},
		});
	});

	it("reads a stage no rep was graded at as unavailable rather than a letter", () => {
		const figures = armFigures(
			{
				quality: [buildSummary({})],
				source: sourceOf([]),
				resources: {
					status: "UNAVAILABLE",
					completeReps: 0,
					missingMetricReps: 4,
					missingEvidence: [
						{ repId: "rep-1", ordinal: 1, missing: ["worker cost"] },
					],
				},
			},
			lettersEverywhere,
		);

		expect(figures.measures["build"]).toEqual({
			scale: "letters",
			grades: { state: "unavailable", reasons: [NO_GRADED_REP_REASON] },
		});
	});

	describe("average words", () => {
		it("averages the words of the attempts that recorded a count", () => {
			expect(
				wordsOf([
					{ state: "available", words: 10 },
					{ state: "available", words: 21 },
					{ state: "unavailable", reason: "the attempt recorded no reply" },
				]),
			).toEqual({
				state: "available",
				averageWords: 15.5,
				counted: 2,
				attempts: 3,
			});
		});

		it("reads unavailable with each rep's reason when no attempt has a count", () => {
			expect(
				wordsOf([
					{ state: "unavailable", reason: "the attempt recorded no reply" },
					{ state: "unavailable", reason: "the stage's only output is a diff" },
				]),
			).toEqual({
				state: "unavailable",
				reasons: [
					"rep-1: the attempt recorded no reply",
					"rep-2: the stage's only output is a diff",
				],
			});
		});

		it("reads unavailable, not zero, for a report written before word counts", () => {
			expect(wordsOf([undefined, undefined])).toEqual({
				state: "unavailable",
				reasons: [NO_RECORDED_WORDS_REASON],
			});
		});
	});
});
