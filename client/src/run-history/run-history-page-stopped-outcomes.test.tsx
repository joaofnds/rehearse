import { describe, expect, it } from "bun:test";

import { within } from "@testing-library/react";

import { UNREAD_STALENESS } from "#client/test-support/run-figures";
import type { PipelineRunRow } from "#server/run-history";

import RunHistoryPage from "./run-history-page";
import {
	stageWithVerdict,
	unreachedStage,
} from "./run-history-page-grades-test-data";
import PipelineRunRowBuilder from "./run-history-page-pipeline-row-builder";
import { cellOf } from "./run-history-page-test-driver";
import {
	registerRunHistoryTestCleanup,
	renderPage,
	respondingWith,
} from "./run-history-page-test-harness";
import type { RunHistoryResponse as RunHistoryResponseBody } from "./run-history-query";

const RUN = "2026-09-20T10-00-00.000Z";

const MINIMUM_B: PipelineRunRow["minimumGrade"] = {
	letter: "B−",
	state: "available",
};

const STOPPED_AT_IMPLEMENT = runWith({
	finalOutcome: {
		reason: "stopped below the minimum",
		stage: "implement",
		state: "available",
		status: "NOT_REACHED",
	},
	minimumGrade: MINIMUM_B,
	stageGrades: {
		grades: [
			stageWithVerdict({ letter: "A−", name: "shape", reachesMinimum: true }),
			stageWithVerdict({ letter: "B+", name: "plan", reachesMinimum: true }),
			stageWithVerdict({
				letter: "D",
				name: "implement",
				reachesMinimum: false,
			}),
			unreachedStage("review"),
		],
		state: "available",
	},
	status: "STOPPED:implement",
});

async function testReadsAStoppedRunAsStoppedAtItsStepWithThatStepSGradeAndTheMinimumItFellBelow(): Promise<void> {
	respondingWith(STOPPED_AT_IMPLEMENT);

	await renderPage().findByText(RUN);

	expect(cellOf({ column: "Outcome", run: RUN }).textContent).toBe(
		"◼stopped at step 3implement D · below minimum B−",
	);
}

async function testLinksAStoppedRunSReasonToTheStepItStoppedAt(): Promise<void> {
	respondingWith(STOPPED_AT_IMPLEMENT);

	await renderPage().findByText(RUN);

	expect(
		within(cellOf({ column: "Outcome", run: RUN })).getByRole("link", {
			name: "implement D · below minimum B−",
		}),
	).toHaveAttribute("href", `/runs/${RUN}/stages/implement`);
}

async function testNamesTheRecordedCauseOfAStopNoGradeBelowTheMinimumMade(): Promise<void> {
	respondingWith(
		runWith({
			finalOutcome: {
				reason: "spend ceiling reached",
				stage: "plan",
				state: "available",
				status: "NOT_REACHED",
			},
			minimumGrade: MINIMUM_B,
			stageGrades: {
				grades: [
					stageWithVerdict({
						letter: "A−",
						name: "shape",
						reachesMinimum: true,
					}),
					{
						grade: {
							reasons: ["the stop record keeps no letter"],
							state: "unavailable",
						},
						stage: "plan",
						status: "stopped",
					},
				],
				state: "available",
			},
			status: "STOPPED:plan",
		}),
	);

	await renderPage().findByText(RUN);

	expect(cellOf({ column: "Outcome", run: RUN }).textContent).toBe(
		"◼stopped at step 2plan · spend ceiling reached",
	);
}

async function testNamesWhyAStoppedRunSGradeOrMinimumIsMissing(): Promise<void> {
	respondingWith(
		runWith({
			finalOutcome: {
				reasons: ["not read by this test"],
				state: "unavailable",
			},
			minimumGrade: {
				reasons: ["the manifest predates the minimum"],
				state: "unavailable",
			},
			stageGrades: {
				grades: [
					stageWithVerdict({
						letter: "A−",
						name: "shape",
						reachesMinimum: true,
					}),
					{
						grade: {
							reasons: ["the stop record keeps no letter"],
							state: "unavailable",
						},
						stage: "implement",
						status: "stopped",
					},
				],
				state: "available",
			},
			status: "STOPPED:implement",
		}),
	);

	await renderPage().findByText(RUN);

	expect(cellOf({ column: "Outcome", run: RUN }).textContent).toBe(
		"◼stopped at step 2implement · the stop record keeps no letter · the manifest predates the minimum",
	);
}

function runWith(
	figures: Pick<
		PipelineRunRow,
		"status" | "stageGrades" | "finalOutcome" | "minimumGrade"
	>,
): RunHistoryResponseBody {
	return {
		launches: [],
		rows: [
			new PipelineRunRowBuilder({
				recordId: `run:${RUN}`,
				...figures,
				caseId: "audit-log",
				checkpoints: [],
				corpusChangedDuringRun: false,
				corpusVersion: undefined,
				grade: undefined,
				launchId: undefined,
				links: [],
				run: RUN,
				shortId: undefined,
				stage: undefined,
				staleness: UNREAD_STALENESS,
			}).build(),
		],
		unreadable: [],
	};
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	describe("the outcome of a finished record", () => {
		it(
			"reads a stopped run as stopped at its step, with that step's grade and the minimum it fell below",
			testReadsAStoppedRunAsStoppedAtItsStepWithThatStepSGradeAndTheMinimumItFellBelow,
		);

		it(
			"links a stopped run's reason to the step it stopped at",
			testLinksAStoppedRunSReasonToTheStepItStoppedAt,
		);

		it(
			"names the recorded cause of a stop no grade below the minimum made",
			testNamesTheRecordedCauseOfAStopNoGradeBelowTheMinimumMade,
		);

		it(
			"names why a stopped run's grade or minimum is missing",
			testNamesWhyAStoppedRunSGradeOrMinimumIsMissing,
		);
	});
});
