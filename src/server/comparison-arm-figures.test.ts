import { describe, expect, it } from "bun:test";
import type { ReliabilitySummary } from "#benchmark/confirmation-report";
import { armFigures } from "./comparison-arm-figures";
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

describe(armFigures.name, () => {
	it("reads cost as unavailable, naming each rep that lacks it", () => {
		const figures = armFigures(
			{
				quality: [buildSummary(Object.fromEntries([["C", 4]]))],
				resources: {
					status: "UNAVAILABLE",
					completeReps: 3,
					missingMetricReps: 1,
					missingEvidence: [
						{ repId: "rep-2", ordinal: 2, missing: ["worker cost"] },
					],
				},
			},
			lettersEverywhere,
		);

		expect(figures.cost).toEqual({
			state: "unavailable",
			reasons: ["rep-2 lacks worker cost"],
		});
	});

	it("reads a stage no rep was graded at as unavailable rather than a letter", () => {
		const figures = armFigures(
			{
				quality: [buildSummary({})],
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
});
