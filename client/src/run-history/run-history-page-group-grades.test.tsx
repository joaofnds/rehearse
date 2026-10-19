import { describe, expect, it } from "bun:test";

import { UNREAD_STALENESS } from "#client/test-support/run-figures";
import type { ConfirmationGroupRow } from "#server/run-history";
import SESSION_GRADE_REASON from "#server/session-grade-reason";

import RunHistoryPage from "./run-history-page";
import { groupStageSummary } from "./run-history-page-grades-test-data";
import ConfirmationGroupRowBuilder from "./run-history-page-group-row-builder";
import { cellOf, expandedFinalOutcomeOf } from "./run-history-page-test-driver";
import {
	registerRunHistoryTestCleanup,
	renderPage,
	respondingWith,
} from "./run-history-page-test-harness";
import type { RunHistoryResponse as RunHistoryResponseBody } from "./run-history-query";

type GroupFigures = Pick<
	ConfirmationGroupRow,
	| "mode"
	| "reps"
	| "pipelineStages"
	| "stageSummaries"
	| "finalOutcomes"
	| "successful"
>;

const GROUP = "group-0143";

const pipelineFigures: GroupFigures = {
	finalOutcomes: { FAIL: 1, NOT_REACHED: 1, PASS: 4 },
	mode: "pipeline",
	pipelineStages: { stages: ["shape", "build", "review"], state: "available" },
	reps: 6,
	stageSummaries: [
		groupStageSummary({ graded: 6, median: "A", stage: "shape" }),
		groupStageSummary({ graded: 5, median: "B", stage: "build" }),
		groupStageSummary({ graded: 0, median: undefined, stage: "review" }),
	],
	successful: 4,
};

const pipelineGroup = groupWith(pipelineFigures);

const stageGroup = groupWith({
	finalOutcomes: { NOT_APPLICABLE: 3 },
	mode: "stage",
	pipelineStages: { stages: ["shape", "build", "review"], state: "available" },
	reps: 3,
	stageSummaries: [
		groupStageSummary({ graded: 3, median: "B", stage: "build" }),
	],
	successful: 3,
});

const sessionFigures: GroupFigures = {
	finalOutcomes: { NOT_APPLICABLE: 6 },
	mode: "session",
	pipelineStages: {
		reasons: ["a session group repeats one session and runs no pipeline"],
		state: "unavailable",
	},
	reps: 6,
	stageSummaries: [
		{
			graded: 0,
			grades: { reasons: [SESSION_GRADE_REASON], state: "unavailable" },
			stage: "checks",
			ungraded: {},
		},
	],
	successful: 4,
};

const sessionGroup = groupWith(sessionFigures);

function groupWith(figures: GroupFigures): RunHistoryResponseBody {
	return {
		launches: [],
		rows: [
			new ConfirmationGroupRowBuilder({
				recordId: `group:${GROUP}`,
				...figures,
				caseId: "audit-log",
				checkpoint: undefined,
				corpusVersion: undefined,
				groupId: GROUP,
				links: [],
				repAttempts: [],
				shortId: undefined,
				staleness: UNREAD_STALENESS,
			}).build(),
		],
		unreadable: [],
	};
}

async function testReadsEachStageSMedianWithTheRepsItCoversAndForAStageNoRepGraded(): Promise<void> {
	respondingWith(pipelineGroup);

	await renderPage().findByText(GROUP);

	expect(cellOf({ column: "Step grades", run: GROUP }).textContent).toBe(
		"Median gradesshapeA · 6 gradedbuildB · 5 gradedreviewNo grade",
	);
}

async function testReadsHowManyOfTheRepsTheFinalJudgeGradedItPassedNamingTheRepsItDidNotGrade(): Promise<void> {
	respondingWith(pipelineGroup);

	await renderPage().findByText(GROUP);

	expect(expandedFinalOutcomeOf(GROUP)).toBe(
		"4 of 5 PASSgraded independently · 1 of 6 reps not judged",
	);
}

async function testReadsOnlyThatItWasGradedIndependentlyWhenTheFinalJudgeGradedEveryRep(): Promise<void> {
	respondingWith(
		groupWith({ ...pipelineFigures, finalOutcomes: { FAIL: 2, PASS: 4 } }),
	);

	await renderPage().findByText(GROUP);

	expect(expandedFinalOutcomeOf(GROUP)).toBe("4 of 6 PASSgraded independently");
}

async function testReadsWithTheRepsNotJudgedWhenTheFinalJudgeGradedNone(): Promise<void> {
	respondingWith(
		groupWith({
			...pipelineFigures,
			finalOutcomes: { NOT_REACHED: 6 },
			successful: 0,
		}),
	);

	await renderPage().findByText(GROUP);

	expect(expandedFinalOutcomeOf(GROUP)).toBe(
		"—not reached · 6 of 6 reps not judged",
	);
}

async function testPlacesItsStageSMedianAtTheStageSPosition(): Promise<void> {
	respondingWith(stageGroup);

	await renderPage().findByText(GROUP);

	expect(cellOf({ column: "Step grades", run: GROUP }).textContent).toBe(
		"Median gradesshapeNot includedbuildB · 3 gradedreviewNot included",
	);
}

async function testDistinguishesAnIncludedUngradedStepFromStepsOutsideTheGroup(): Promise<void> {
	respondingWith(
		groupWith({
			finalOutcomes: { NOT_APPLICABLE: 3 },
			mode: "stage",
			pipelineStages: {
				stages: ["shape", "build", "review"],
				state: "available",
			},
			reps: 3,
			stageSummaries: [
				groupStageSummary({ graded: 0, median: undefined, stage: "build" }),
			],
			successful: 0,
		}),
	);

	await renderPage().findByText(GROUP);

	expect(cellOf({ column: "Step grades", run: GROUP }).textContent).toBe(
		"Median gradesshapeNot includedbuildNo gradereviewNot included",
	);
}

async function testReadsNAAsItsTaskGrade(): Promise<void> {
	respondingWith(stageGroup);

	await renderPage().findByText(GROUP);

	expect(expandedFinalOutcomeOf(GROUP)).toContain("n/astep replay only");
}

async function testReadsHowManyRepsPassedTheirChecksAsItsStepGrades(): Promise<void> {
	respondingWith(sessionGroup);

	await renderPage().findByText(GROUP);

	expect(cellOf({ column: "Step grades", run: GROUP }).textContent).toBe(
		"Reply/transcript basis4/6 recorded successful",
	);
}

async function testCountsOnlyTheRepsItRecordedNamingTheRepsItCouldNot(): Promise<void> {
	respondingWith(
		groupWith({ ...sessionFigures, finalOutcomes: { NOT_APPLICABLE: 5 } }),
	);

	await renderPage().findByText(GROUP);

	expect(cellOf({ column: "Step grades", run: GROUP }).textContent).toBe(
		"Reply/transcript basis4/5 recorded successful1 of 6 reps not recorded",
	);
}

async function testReadsNAWithWhyASessionHasNoLetterAsItsTaskGrade(): Promise<void> {
	respondingWith(sessionGroup);

	await renderPage().findByText(GROUP);

	expect(expandedFinalOutcomeOf(GROUP)).toContain(`n/a${SESSION_GRADE_REASON}`);
}

function describeInPipelineMode(): void {
	it(
		"reads each stage's median with the reps it covers, and · for a stage no rep graded",
		testReadsEachStageSMedianWithTheRepsItCoversAndForAStageNoRepGraded,
	);

	it(
		"reads how many of the reps the final judge graded it passed, naming the reps it did not grade",
		testReadsHowManyOfTheRepsTheFinalJudgeGradedItPassedNamingTheRepsItDidNotGrade,
	);

	it(
		"reads only that it was graded independently when the final judge graded every rep",
		testReadsOnlyThatItWasGradedIndependentlyWhenTheFinalJudgeGradedEveryRep,
	);

	it(
		"reads — with the reps not judged when the final judge graded none",
		testReadsWithTheRepsNotJudgedWhenTheFinalJudgeGradedNone,
	);
}

function describeInStageMode(): void {
	it(
		"places its stage's median at the stage's position",
		testPlacesItsStageSMedianAtTheStageSPosition,
	);

	it(
		"distinguishes an included ungraded step from steps outside the group",
		testDistinguishesAnIncludedUngradedStepFromStepsOutsideTheGroup,
	);

	it("reads n/a as its task grade", testReadsNAAsItsTaskGrade);
}

function describeInSessionMode(): void {
	it(
		"reads how many reps passed their checks as its step grades",
		testReadsHowManyRepsPassedTheirChecksAsItsStepGrades,
	);

	it(
		"counts only the reps it recorded, naming the reps it could not",
		testCountsOnlyTheRepsItRecordedNamingTheRepsItCouldNot,
	);

	it(
		"reads n/a with why a session has no letter as its task grade",
		testReadsNAWithWhyASessionHasNoLetterAsItsTaskGrade,
	);
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	describe("the step grades and task grade of a confirmation group", () => {
		describe("in pipeline mode", describeInPipelineMode);

		describe("in stage mode", describeInStageMode);

		describe("in session mode", describeInSessionMode);
	});
});
