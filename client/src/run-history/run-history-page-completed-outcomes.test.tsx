import { describe, expect, it } from "bun:test";

import { UNREAD_STALENESS } from "#client/test-support/run-figures";
import type { PipelineRunRow } from "#server/run-history";

import RunHistoryPage from "./run-history-page";
import { stageWithVerdict } from "./run-history-page-grades-test-data";
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

async function testReadsACompletedRunAsCompletedWithEveryStepAtOrAboveTheMinimum(): Promise<void> {
	respondingWith(
		runWith({
			finalOutcome: { state: "available", status: "JUDGED", verdict: "PASS" },
			minimumGrade: MINIMUM_B,
			stageGrades: {
				grades: [
					stageWithVerdict({
						letter: "A−",
						name: "shape",
						reachesMinimum: true,
					}),
					stageWithVerdict({
						letter: "B+",
						name: "plan",
						reachesMinimum: true,
					}),
					stageWithVerdict({
						letter: "B",
						name: "implement",
						reachesMinimum: true,
					}),
				],
				state: "available",
			},
			status: "COMPLETE",
		}),
	);

	await renderPage().findByText(RUN);

	expect(cellOf({ column: "Outcome", run: RUN }).textContent).toBe(
		"✓completed 3 of 3all steps at or above minimum",
	);
}

async function testCountsACompletedRunSStepsGradedAtOrAboveTheMinimumWhenSomeCarryNoGrade(): Promise<void> {
	respondingWith(
		runWith({
			finalOutcome: { state: "available", status: "JUDGED", verdict: "PASS" },
			minimumGrade: MINIMUM_B,
			stageGrades: {
				grades: [
					stageWithVerdict({
						letter: "A−",
						name: "shape",
						reachesMinimum: true,
					}),
					{
						grade: { reasons: ["no record"], state: "unavailable" },
						stage: "plan",
						status: "no-record",
					},
				],
				state: "available",
			},
			status: "COMPLETE",
		}),
	);

	await renderPage().findByText(RUN);

	expect(cellOf({ column: "Outcome", run: RUN }).textContent).toBe(
		"✓completed 2 of 21 of 2 steps graded at or above minimum",
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
			"reads a completed run as completed with every step at or above the minimum",
			testReadsACompletedRunAsCompletedWithEveryStepAtOrAboveTheMinimum,
		);

		it(
			"counts a completed run's steps graded at or above the minimum when some carry no grade",
			testCountsACompletedRunSStepsGradedAtOrAboveTheMinimumWhenSomeCarryNoGrade,
		);
	});
});
