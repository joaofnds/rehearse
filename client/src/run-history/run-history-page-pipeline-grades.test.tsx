import { describe, expect, it } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import {
	UNREAD_RUN_FIGURES,
	UNREAD_STALENESS,
} from "#client/test-support/run-figures";
import type { PipelineRunRow } from "#server/run-history";

import RunHistoryPage from "./run-history-page";
import {
	gradedStage,
	ungradedStage,
} from "./run-history-page-grades-test-data";
import PipelineRunRowBuilder from "./run-history-page-pipeline-row-builder";
import { cellOf, expandedFinalOutcomeOf } from "./run-history-page-test-driver";
import {
	registerRunHistoryTestCleanup,
	renderPage,
	respondingWith,
} from "./run-history-page-test-harness";
import type { RunHistoryResponse as RunHistoryResponseBody } from "./run-history-query";

const RUN = "2026-09-20T10-00-00.000Z";

const FINAL_OUTCOME_READINGS = [
	[
		"the final judge's passing verdict",
		{ state: "available", status: "JUDGED", verdict: "PASS" },
		"PASSgraded independently",
	],
	[
		"the final judge's failing verdict",
		{ state: "available", status: "JUDGED", verdict: "FAIL" },
		"FAILgraded independently",
	],
	[
		"a dash while the run is pending",
		{ stage: "build", state: "available", status: "PENDING" },
		"—pending · the run is at build",
	],
	[
		"a dash with why the final judge was not reached",
		{
			reason: "the run stopped at build",
			stage: "build",
			state: "available",
			status: "NOT_REACHED",
		},
		"—not reached · the run stopped at build",
	],
	[
		"a dash with why judging failed",
		{
			reason: "the judge returned no verdict",
			state: "available",
			status: "JUDGING_FAILED",
		},
		"—judging failed · the judge returned no verdict",
	],
	[
		"a dash with why the outcome could not be read",
		{ reasons: ["the artifact does not parse"], state: "unavailable" },
		"—the artifact does not parse",
	],
] as const;

function runWith(
	figures: Pick<PipelineRunRow, "stageGrades" | "finalOutcome">,
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
				stage: "review",
				staleness: UNREAD_STALENESS,
				status: "COMPLETE",
			}).build(),
		],
		unreadable: [],
	};
}

async function testPairsEveryGradeWithItsStepAndNamesStepsThatDidNotRun(): Promise<void> {
	respondingWith(
		runWith({
			...UNREAD_RUN_FIGURES,
			stageGrades: {
				grades: [
					gradedStage({ letter: "A−", stage: "shape" }),
					gradedStage({ letter: "B+", stage: "plan" }),
					{
						...gradedStage({ letter: "D", stage: "build" }),
						status: "stopped",
					},
					ungradedStage({ stage: "review", status: "not-run" }),
				],
				state: "available",
			},
		}),
	);

	await renderPage().findByText(RUN);

	expect(cellOf({ column: "Step grades", run: RUN }).textContent).toBe(
		"shapeA−planB+buildDreviewNot run",
	);
}

async function testSaysWhyItsStepGradesCouldNotBeRead(): Promise<void> {
	respondingWith(
		runWith({
			...UNREAD_RUN_FIGURES,
			stageGrades: {
				reasons: ["the run wrote no manifest, which names its stages"],
				state: "unavailable",
			},
		}),
	);

	await renderPage().findByText(RUN);

	expect(cellOf({ column: "Step grades", run: RUN })).toHaveTextContent(
		"the run wrote no manifest, which names its stages",
	);
}

async function testKeepsFinalOutcomeDetailsClosedWhenFilteringReplacesARow(): Promise<void> {
	const first = new PipelineRunRowBuilder({
		finalOutcome: {
			reason: "First run stopped",
			state: "available",
			status: "NOT_REACHED",
		},
		run: RUN,
		stage: "review",
	}).build();
	const second = {
		...first,
		caseId: "billing",
		finalOutcome: {
			reason: "Second run stopped",
			state: "available",
			status: "NOT_REACHED",
		} as const,
		recordId: "run:2026-09-22T10-00-00.000Z",
		run: "2026-09-22T10-00-00.000Z",
	};
	respondingWith({ launches: [], rows: [first, second], unreadable: [] });
	await renderPage().findByText(RUN);
	fireEvent.click(
		within(cellOf({ column: "Final outcome", run: RUN })).getByRole("button", {
			name: "details",
		}),
	);
	expect(cellOf({ column: "Final outcome", run: RUN })).toHaveTextContent(
		"First run stopped",
	);
	fireEvent.change(screen.getByRole("searchbox", { name: "Search runs" }), {
		target: { value: "billing" },
	});
	expect(
		within(cellOf({ column: "Final outcome", run: second.run })).getByRole(
			"button",
			{ name: "details" },
		),
	).toHaveAttribute("aria-expanded", "false");
	expect(
		cellOf({ column: "Final outcome", run: second.run }),
	).not.toHaveTextContent("Second run stopped");
}

async function testReadsFinalOutcome(
	_reading: string,
	finalOutcome: PipelineRunRow["finalOutcome"],
	text: string,
): Promise<void> {
	respondingWith(runWith({ ...UNREAD_RUN_FIGURES, finalOutcome }));

	await renderPage().findByText(RUN);

	expect(expandedFinalOutcomeOf(RUN)).toBe(text);
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	describe("the step grades and task grade of a pipeline run", () => {
		it(
			"pairs every grade with its step and names steps that did not run",
			testPairsEveryGradeWithItsStepAndNamesStepsThatDidNotRun,
		);

		it(
			"says why its step grades could not be read",
			testSaysWhyItsStepGradesCouldNotBeRead,
		);

		it(
			"keeps final-outcome details closed when filtering replaces a row",
			testKeepsFinalOutcomeDetailsClosedWhenFilteringReplacesARow,
		);

		it.each(FINAL_OUTCOME_READINGS)(
			"reads as its task grade %s",
			testReadsFinalOutcome,
		);
	});
});
