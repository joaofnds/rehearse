import { afterEach, describe, expect, it } from "bun:test";

import { within } from "@testing-library/react";

import { RunRecordBuilder } from "#client/test-support/run-detail";
import {
	originalFetch,
	renderLedger,
	renderReachedFirstStep,
	stoppedByVerdict,
	stoppedWithFigures,
	unreachedStages,
} from "#client/test-support/run-detail/ledger-test-fixtures";
import type { RunRecordStage } from "#server/run-record";
import {
	INTERRUPTED_REASON,
	RUN_FAILED_REASON,
	UNEXPLAINED_END_REASON,
} from "#server/run-record";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("Record ledger", () => {
	describe("stages the run never reached", () => {
		it(
			"notes on a stopped run that each one never ran, as a recorded outcome",
			notesOnAStoppedRunThatEachOneNeverRanAsARecordedOutcome,
		);

		it(
			"names a stop its judge made without the minimum",
			namesAStopItsJudgeMadeWithoutTheMinimum,
		);

		it.each([
			[
				"its ceiling refused the stage's session",
				{ reasons: ["the stage stopped the run"], state: "unavailable" },
			],
			[
				"it stopped after the stage passed its judge",
				{
					letter: "A",
					reachesMinimum: true,
					state: "available",
					verdict: "CONTINUE",
				},
			],
		] as const)("states the run's own reason when %s", readsStoppedRunReason);

		it(
			"states the ending a paused run recorded rather than showing them queued",
			statesTheEndingAPausedRunRecordedRatherThanShowingThemQueued,
		);

		it(
			"shows them as running or queued while the run is in flight",
			showsThemAsRunningOrQueuedWhileTheRunIsInFlight,
		);

		it.each([
			["FAILED", RUN_FAILED_REASON],
			["INTERRUPTED", INTERRUPTED_REASON],
		])(
			"states a %s run's own reason and no recorded outcome",
			readsEndedRunReason,
		);
	});
});

async function notesOnAStoppedRunThatEachOneNeverRanAsARecordedOutcome(): Promise<void> {
	renderLedger();

	const note = within(await unreachedStages()).getByRole("listitem");

	expect(note).toHaveTextContent(
		"Step 3 · verify never ran. The run stopped after step 2 fell below the minimum. This is a recorded outcome for corpus@a41c7e, not a failed execution.",
	);
	expect(note).toHaveClass("border-dashed");
}

async function namesAStopItsJudgeMadeWithoutTheMinimum(): Promise<void> {
	renderLedger(new Map(), stoppedByVerdict());

	expect(await unreachedStages()).toHaveTextContent(
		"Step 3 · verify never ran. The run stopped after step 2. This is a recorded outcome for corpus@a41c7e, not a failed execution.",
	);
}

async function statesTheEndingAPausedRunRecordedRatherThanShowingThemQueued(): Promise<void> {
	renderReachedFirstStep("PAUSED:shape", {
		reason: UNEXPLAINED_END_REASON,
		stage: "shape",
		status: "NOT_REACHED",
	});

	const items = within(await unreachedStages()).getAllByRole("listitem");

	expect(items.map((item) => item.textContent)).toEqual([
		`Step 2 · build did not run: ${UNEXPLAINED_END_REASON}.`,
		`Step 3 · verify did not run: ${UNEXPLAINED_END_REASON}.`,
	]);
}

async function showsThemAsRunningOrQueuedWhileTheRunIsInFlight(): Promise<void> {
	renderReachedFirstStep("RUNNING", { stage: "build", status: "PENDING" });

	const items = within(await unreachedStages()).getAllByRole("listitem");

	expect(items.map((item) => item.textContent)).toEqual([
		"Step 2 · build●session running",
		"Step 3 · verify○queued",
	]);
}

async function readsStoppedRunReason(
	_cause: string,
	grade: RunRecordStage["grade"],
): Promise<void> {
	const record = stoppedWithFigures();
	const reason = "Reached maximum budget ($0.004872600000000116)";
	const ended = new RunRecordBuilder({
		...record,
		finalOutcome: { reason, stage: "build", status: "NOT_REACHED" },
	})
		.withStage({ grade, stage: "build" })
		.build();

	renderLedger(new Map(), ended);

	const note = within(await unreachedStages()).getByRole("listitem");

	expect(note).toHaveTextContent(`Step 3 · verify did not run: ${reason}.`);
	expect(note).not.toHaveClass("border-dashed");
}

async function readsEndedRunReason(
	status: string,
	reason: string,
): Promise<void> {
	renderReachedFirstStep(status, {
		reason,
		stage: "build",
		status: "NOT_REACHED",
	});

	const items = within(await unreachedStages()).getAllByRole("listitem");

	expect(items.map((item) => item.textContent)).toEqual([
		`Step 2 · build ended without a record: ${reason}.`,
		`Step 3 · verify did not run: ${reason}.`,
	]);
	const [observedFirstItem] = items;

	expect(observedFirstItem).not.toHaveClass("border-dashed");
}
