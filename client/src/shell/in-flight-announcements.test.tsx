import { afterEach, describe, expect, it } from "bun:test";

import { screen } from "@testing-library/react";

import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import ListedStageGradeBuilder from "#client/test-support/listed-stage-grade-test-builder";

import {
	bar,
	originalFetch,
	renderRunInFlight,
} from "./in-flight-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("what a screen reader hears of a run in flight", () => {
	it(
		"keeps the visible readings out of the live region",
		keepsTheVisibleReadingsOutOfTheLiveRegion,
	);

	it("announces a stage continuing", announcesAStageContinuing);

	it(
		"announces a stage stopped after the bar has left",
		announcesAStageStoppedAfterTheBarHasLeft,
	);

	it(
		"announces nothing again for stages accepted before a reading that could not read them",
		announcesNothingAgainForStagesAcceptedBeforeAReadingThatCouldNotReadThem,
	);

	it(
		"announces a stage continuing while a reading could not read the stages",
		announcesAStageContinuingWhileAReadingCouldNotReadTheStages,
	);

	it(
		"announces the ceiling approached and then nothing new while spend moves on",
		announcesTheCeilingApproachedAndThenNothingNewWhileSpendMovesOn,
	);
});

function keepsTheVisibleReadingsOutOfTheLiveRegion(): void {
	renderRunInFlight([
		new PipelineRunRowBuilder({}).withExecutionProgress().build(),
	]);

	expect(screen.getByRole("status")).toBeEmptyDOMElement();
	expect(bar()).not.toHaveAttribute("aria-live");
}

function announcesAStageContinuing(): void {
	const { rerender } = renderRunInFlight([
		new PipelineRunRowBuilder({
			stageGrades: {
				grades: [
					new ListedStageGradeBuilder({ stage: "plan" }).build(),
					new ListedStageGradeBuilder({ stage: "build" }).build(),
				],
				state: "available",
			},
		})
			.withExecutionProgress()
			.build(),
	]);

	rerender([
		new PipelineRunRowBuilder({
			stageGrades: {
				grades: [
					new ListedStageGradeBuilder({ stage: "plan" })
						.graded({ letter: "B+" })
						.build(),
					new ListedStageGradeBuilder({ stage: "build" }).build(),
				],
				state: "available",
			},
		})
			.withExecutionProgress()
			.build(),
	]);

	expect(screen.getByRole("status")).toHaveTextContent(
		"r-0148 step 1 of 2 continued: plan B+",
	);
}

function announcesAStageStoppedAfterTheBarHasLeft(): void {
	const { rerender } = renderRunInFlight([
		new PipelineRunRowBuilder({
			stageGrades: {
				grades: [
					new ListedStageGradeBuilder({ stage: "plan" })
						.graded({ letter: "B+" })
						.build(),
					new ListedStageGradeBuilder({ stage: "build" }).build(),
				],
				state: "available",
			},
		})
			.withExecutionProgress()
			.build(),
	]);

	rerender([
		new PipelineRunRowBuilder({
			stageGrades: {
				grades: [
					new ListedStageGradeBuilder({ stage: "plan" })
						.graded({ letter: "B+" })
						.build(),
					new ListedStageGradeBuilder({ stage: "build" })
						.graded({ letter: "D", verdict: "STOP" })
						.build(),
				],
				state: "available",
			},
			status: "STOPPED:build",
		})
			.withExecutionProgress()
			.build(),
	]);

	expect(screen.getByRole("status")).toHaveTextContent(
		"r-0148 stopped at step 2 of 2: build",
	);
}

function announcesNothingAgainForStagesAcceptedBeforeAReadingThatCouldNotReadThem(): void {
	const accepted = [
		new ListedStageGradeBuilder({ stage: "plan" })
			.graded({ letter: "B+" })
			.build(),
		new ListedStageGradeBuilder({ stage: "design" })
			.graded({ letter: "A-" })
			.build(),
		new ListedStageGradeBuilder({ stage: "build" }).build(),
	];
	const { rerender } = renderRunInFlight([
		new PipelineRunRowBuilder({
			stageGrades: { grades: accepted, state: "available" },
		})
			.withExecutionProgress()
			.build(),
	]);

	rerender([new PipelineRunRowBuilder({}).withExecutionProgress().build()]);
	rerender([
		new PipelineRunRowBuilder({
			stageGrades: { grades: accepted, state: "available" },
		})
			.withExecutionProgress()
			.build(),
	]);

	expect(screen.getByRole("status")).toBeEmptyDOMElement();
}

function announcesAStageContinuingWhileAReadingCouldNotReadTheStages(): void {
	const { rerender } = renderRunInFlight([
		new PipelineRunRowBuilder({
			stageGrades: {
				grades: [
					new ListedStageGradeBuilder({ stage: "plan" })
						.graded({ letter: "B+" })
						.build(),
					new ListedStageGradeBuilder({ stage: "design" }).build(),
					new ListedStageGradeBuilder({ stage: "build" }).build(),
				],
				state: "available",
			},
		})
			.withExecutionProgress()
			.build(),
	]);

	rerender([new PipelineRunRowBuilder({}).withExecutionProgress().build()]);
	rerender([
		new PipelineRunRowBuilder({
			stageGrades: {
				grades: [
					new ListedStageGradeBuilder({ stage: "plan" })
						.graded({ letter: "B+" })
						.build(),
					new ListedStageGradeBuilder({ stage: "design" })
						.graded({ letter: "A-" })
						.build(),
					new ListedStageGradeBuilder({ stage: "build" }).build(),
				],
				state: "available",
			},
		})
			.withExecutionProgress()
			.build(),
	]);

	expect(screen.getByRole("status")).toHaveTextContent(
		"r-0148 step 2 of 3 continued: design A-",
	);
}

function announcesTheCeilingApproachedAndThenNothingNewWhileSpendMovesOn(): void {
	const { rerender } = renderRunInFlight([
		new PipelineRunRowBuilder({})
			.withExecutionProgress({ ceilingUsd: 10, runSpentUsd: 7.9 })
			.build(),
	]);
	rerender([
		new PipelineRunRowBuilder({})
			.withExecutionProgress({ ceilingUsd: 10, runSpentUsd: 8.1 })
			.build(),
	]);
	const region = screen.getByRole("status");
	const announced = region.textContent;

	rerender([
		new PipelineRunRowBuilder({})
			.withExecutionProgress({ ceilingUsd: 10, runSpentUsd: 9 })
			.build(),
	]);

	expect(announced).toBe("r-0148 has spent $8.10 of its $10.00 ceiling");
	expect(region.textContent).toBe(announced);
}
