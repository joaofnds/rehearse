import { describe, expect, it } from "bun:test";

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

const casesForReadsARunThatEndedSAsInterruptedNamingTheStepAndTheCause1 = [
	["INTERRUPTED", "the run was interrupted before its final judge"],
	["FAILED", "the run failed before its final judge"],
];

const RUN = "2026-09-20T10-00-00.000Z";

const MINIMUM_B: PipelineRunRow["minimumGrade"] = {
	letter: "B−",
	state: "available",
};

async function testReadsARunThatEndedWithNoRecordedStepAsInterruptedNamingTheCause(): Promise<void> {
	respondingWith(
		runWith({
			finalOutcome: {
				reason: "the run ended without recording how it ended",
				state: "available",
				status: "NOT_REACHED",
			},
			minimumGrade: MINIMUM_B,
			stageGrades: { grades: [], state: "available" },
			status: "INTERRUPTED",
		}),
	);

	await renderPage().findByText(RUN);

	expect(cellOf({ column: "Outcome", run: RUN }).textContent).toBe(
		"⊘interruptedthe run ended without recording how it ended",
	);
}

async function testReadsARunWhoseFinalJudgeFailedAsSuchNamingTheFailure(): Promise<void> {
	respondingWith(
		runWith({
			finalOutcome: {
				reason: "the final judge returned no valid grade",
				state: "available",
				status: "JUDGING_FAILED",
			},
			minimumGrade: MINIMUM_B,
			stageGrades: {
				grades: [
					stageWithVerdict({
						letter: "B",
						name: "shape",
						reachesMinimum: true,
					}),
					stageWithVerdict({ letter: "B", name: "plan", reachesMinimum: true }),
				],
				state: "available",
			},
			status: "FAILED",
		}),
	);

	await renderPage().findByText(RUN);

	expect(cellOf({ column: "Outcome", run: RUN }).textContent).toBe(
		"⊘final judge failedthe final judge returned no valid grade",
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
		it.each(casesForReadsARunThatEndedSAsInterruptedNamingTheStepAndTheCause1)(
			"reads a run that ended %s as interrupted, naming the step and the cause",
			async (status, reason) => {
				respondingWith(
					runWith({
						finalOutcome: {
							reason,
							stage: "plan",
							state: "available",
							status: "NOT_REACHED",
						},
						minimumGrade: MINIMUM_B,
						stageGrades: {
							grades: [
								stageWithVerdict({
									letter: "B",
									name: "shape",
									reachesMinimum: true,
								}),
								unreachedStage("plan"),
							],
							state: "available",
						},
						status,
					}),
				);

				await renderPage().findByText(RUN);

				expect(cellOf({ column: "Outcome", run: RUN }).textContent).toBe(
					`⊘interrupted at step 2plan · ${reason}`,
				);
			},
		);

		it(
			"reads a run that ended with no recorded step as interrupted, naming the cause",
			testReadsARunThatEndedWithNoRecordedStepAsInterruptedNamingTheCause,
		);

		it(
			"reads a run whose final judge failed as such, naming the failure",
			testReadsARunWhoseFinalJudgeFailedAsSuchNamingTheFailure,
		);
	});
});
