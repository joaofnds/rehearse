import { describe, expect, it } from "bun:test";

import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import ListedStageGradeBuilder from "#client/test-support/listed-stage-grade-test-builder";

import {
	announcements,
	gradesSoFar,
	runsInFlight,
	stepOf,
} from "./run-in-flight";

const PLAN_B_PLUS_GRADE = new ListedStageGradeBuilder({ stage: "plan" })
	.graded({ letter: "B+" })
	.build();

const BUILD_WITHOUT_GRADE = new ListedStageGradeBuilder().build();

const BUILD_D_GRADE_STOP = new ListedStageGradeBuilder()
	.graded({ letter: "D", verdict: "STOP" })
	.build();

const RUNNING_ROW = new PipelineRunRowBuilder().withExecutionProgress().build();

const PLAN_B_PLUS_BUILD_WITHOUT_GRADES = {
	grades: [PLAN_B_PLUS_GRADE, BUILD_WITHOUT_GRADE],
	state: "available",
} as const;

const PLAN_GRADED_ROW = new PipelineRunRowBuilder({
	...RUNNING_ROW,
	stageGrades: PLAN_B_PLUS_BUILD_WITHOUT_GRADES,
}).build();

const STOPPED_BUILD_ROW = new PipelineRunRowBuilder({
	stageGrades: {
		grades: [PLAN_B_PLUS_GRADE, BUILD_D_GRADE_STOP],
		state: "available",
	},
	status: "STOPPED:build",
})
	.withExecutionProgress()
	.build();

const ABOVE_EIGHTY_PERCENT_ROW = new PipelineRunRowBuilder()
	.withExecutionProgress({ ceilingUsd: 10, runSpentUsd: 8.1 })
	.build();

const PLAN_B_PLUS_BUILD_REVIEW_GRADES = {
	grades: [
		PLAN_B_PLUS_GRADE,
		BUILD_WITHOUT_GRADE,
		new ListedStageGradeBuilder({ stage: "review" }).build(),
	],
	state: "available",
} as const;

describe(runsInFlight.name, () => {
	it(
		"lists the pipeline runs in flight, newest first",
		listsThePipelineRunsInFlightNewestFirst,
	);
});

describe(stepOf.name, () => {
	it(
		"places the running stage among the run's stages",
		placesTheRunningStageAmongTheRunSStages,
	);

	it(
		"places nothing when the run's stages were not read",
		placesNothingWhenTheRunSStagesWereNotRead,
	);
});

describe(gradesSoFar.name, () => {
	it(
		"lists the letters of the stages graded so far, in pipeline order",
		listsTheLettersOfTheStagesGradedSoFarInPipelineOrder,
	);
});

describe(announcements.name, () => {
	it(
		"announces a stage continuing since the last reading",
		announcesAStageContinuingSinceTheLastReading,
	);

	it(
		"announces nothing for a stage graded while the run is still in it",
		announcesNothingForAStageGradedWhileTheRunIsStillInIt,
	);

	it(
		"announces the last stage continuing when the run completes",
		announcesTheLastStageContinuingWhenTheRunCompletes,
	);

	it(
		"announces a run that stopped at a stage since the last reading",
		announcesARunThatStoppedAtAStageSinceTheLastReading,
	);

	it(
		"announces the ceiling approached when run spend first reaches 80% of it",
		announcesTheCeilingApproachedWhenRunSpendFirstReaches80OfIt,
	);

	it(
		"announces the ceiling approached when run spend lands exactly on 80% of it",
		announcesTheCeilingApproachedWhenRunSpendLandsExactlyOn80OfIt,
	);

	it("announces a run the operator stopped", announcesARunTheOperatorStopped);

	it(
		"announces nothing when only the spend moved below the ceiling's 80%",
		announcesNothingWhenOnlyTheSpendMovedBelowTheCeilingS80,
	);

	it(
		"announces nothing for spend that stays past the ceiling's 80%",
		announcesNothingForSpendThatStaysPastTheCeilingS80,
	);

	it(
		"announces nothing about a run it did not see in flight",
		announcesNothingAboutARunItDidNotSeeInFlight,
	);
});

function listsThePipelineRunsInFlightNewestFirst(): void {
	const older = new PipelineRunRowBuilder({ run: "2026-09-30T09-00-00.000Z" })
		.withExecutionProgress()
		.build();
	const newer = new PipelineRunRowBuilder({ run: "2026-09-30T11-00-00.000Z" })
		.withExecutionProgress()
		.build();

	const listed = runsInFlight([
		older,
		new PipelineRunRowBuilder({ status: "COMPLETE" })
			.withExecutionProgress()
			.build(),
		newer,
	]);

	expect(listed.map(({ run }) => run)).toEqual([newer.run, older.run]);
}

function placesTheRunningStageAmongTheRunSStages(): void {
	const row = new PipelineRunRowBuilder({
		stageGrades: PLAN_B_PLUS_BUILD_REVIEW_GRADES,
	})
		.withExecutionProgress({ stage: "build" })
		.build();

	expect(stepOf(row)).toEqual({ number: 2, of: 3 });
}

function placesNothingWhenTheRunSStagesWereNotRead(): void {
	expect(stepOf(RUNNING_ROW)).toBeUndefined();
}

function listsTheLettersOfTheStagesGradedSoFarInPipelineOrder(): void {
	const row = new PipelineRunRowBuilder({
		...RUNNING_ROW,
		stageGrades: {
			grades: [
				new ListedStageGradeBuilder({ stage: "plan" })
					.graded({ letter: "A-" })
					.build(),
				new ListedStageGradeBuilder({ stage: "design" })
					.graded({ letter: "B+" })
					.build(),
				BUILD_WITHOUT_GRADE,
			],
			state: "available",
		},
	}).build();

	expect(gradesSoFar(row)).toEqual(["A-", "B+"]);
}

function announcesAStageContinuingSinceTheLastReading(): void {
	const before = new PipelineRunRowBuilder({
		...RUNNING_ROW,
		stageGrades: {
			grades: [
				new ListedStageGradeBuilder({ stage: "plan" }).build(),
				BUILD_WITHOUT_GRADE,
			],
			state: "available",
		},
	}).build();
	const after = PLAN_GRADED_ROW;

	expect(announcements([before], [after])).toEqual([
		"r-0148 step 1 of 2 continued: plan B+",
	]);
}

function announcesNothingForAStageGradedWhileTheRunIsStillInIt(): void {
	const before = PLAN_GRADED_ROW;
	const after = new PipelineRunRowBuilder({
		...RUNNING_ROW,
		stageGrades: STOPPED_BUILD_ROW.stageGrades,
	}).build();

	expect(announcements([before], [after])).toEqual([]);
}

function announcesTheLastStageContinuingWhenTheRunCompletes(): void {
	const before = PLAN_GRADED_ROW;
	const after = new PipelineRunRowBuilder({
		stageGrades: {
			grades: [
				PLAN_B_PLUS_GRADE,
				new ListedStageGradeBuilder().graded({ letter: "A" }).build(),
			],
			state: "available",
		},
		status: "COMPLETE",
	})
		.withExecutionProgress()
		.build();

	expect(announcements([before], [after])).toEqual([
		"r-0148 step 2 of 2 continued: build A",
	]);
}

function announcesARunThatStoppedAtAStageSinceTheLastReading(): void {
	const before = PLAN_GRADED_ROW;
	const after = STOPPED_BUILD_ROW;

	expect(announcements([before], [after])).toEqual([
		"r-0148 stopped at step 2 of 2: build",
	]);
}

function announcesTheCeilingApproachedWhenRunSpendFirstReaches80OfIt(): void {
	const before = new PipelineRunRowBuilder()
		.withExecutionProgress({ ceilingUsd: 10, runSpentUsd: 7.9 })
		.build();
	const after = ABOVE_EIGHTY_PERCENT_ROW;

	expect(announcements([before], [after])).toEqual([
		"r-0148 has spent $8.10 of its $10.00 ceiling",
	]);
}

function announcesTheCeilingApproachedWhenRunSpendLandsExactlyOn80OfIt(): void {
	const before = new PipelineRunRowBuilder()
		.withExecutionProgress({ ceilingUsd: 10, runSpentUsd: 7.99 })
		.build();
	const after = new PipelineRunRowBuilder()
		.withExecutionProgress({ ceilingUsd: 10, runSpentUsd: 8 })
		.build();

	expect(announcements([before], [after])).toEqual([
		"r-0148 has spent $8.00 of its $10.00 ceiling",
	]);
}

function announcesARunTheOperatorStopped(): void {
	const before = RUNNING_ROW;
	const after = new PipelineRunRowBuilder({ status: "OPERATOR_STOPPED" })
		.withExecutionProgress()
		.build();

	expect(announcements([before], [after])).toEqual([
		"r-0148 stopped by the operator",
	]);
}

function announcesNothingWhenOnlyTheSpendMovedBelowTheCeilingS80(): void {
	const before = new PipelineRunRowBuilder()
		.withExecutionProgress({ ceilingUsd: 10, runSpentUsd: 1 })
		.build();
	const after = new PipelineRunRowBuilder()
		.withExecutionProgress({ ceilingUsd: 10, runSpentUsd: 2.5 })
		.build();

	expect(announcements([before], [after])).toEqual([]);
}

function announcesNothingForSpendThatStaysPastTheCeilingS80(): void {
	const before = ABOVE_EIGHTY_PERCENT_ROW;
	const after = new PipelineRunRowBuilder()
		.withExecutionProgress({ ceilingUsd: 10, runSpentUsd: 9 })
		.build();

	expect(announcements([before], [after])).toEqual([]);
}

function announcesNothingAboutARunItDidNotSeeInFlight(): void {
	expect(announcements([], [STOPPED_BUILD_ROW])).toEqual([]);
}
