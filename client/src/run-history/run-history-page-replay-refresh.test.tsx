import { afterEach, describe, expect, it } from "bun:test";

import { focusManager } from "@tanstack/react-query";
import { fireEvent, waitFor, within } from "@testing-library/react";

import RunHistoryPage from "./run-history-page";
import openReactiveReplayHistory from "./run-history-page-reactive-replay-fixture";
import { FINISHED, STOPPED } from "./run-history-page-replay-history-builder";
import { registerRunHistoryTestCleanup } from "./run-history-page-test-harness";

const FIRST_POSTED_REQUEST_INDEX = 0;

async function testReturnsToTheStepItOpenedOn(): Promise<void> {
	const { dialog, server, omitFinishedRun } = await openReactiveReplayHistory();
	fireEvent.change(within(dialog).getByLabelText("Run"), {
		target: { value: FINISHED },
	});

	omitFinishedRun();
	focusManager.setFocused(false);
	focusManager.setFocused(true);
	await waitFor(() => {
		expect(within(dialog).getByLabelText("Run")).toHaveValue(STOPPED);
	});
	fireEvent.click(
		within(dialog).getByRole("button", { name: "Start · 1 attempt" }),
	);

	await waitFor(() => {
		const expectedPostedCount = 1;

		expect(server.posted("/api/launches")).toHaveLength(expectedPostedCount);
	});
	expect(
		JSON.parse(
			server.posted("/api/launches")[FIRST_POSTED_REQUEST_INDEX]?.body ?? "",
		),
	).toMatchObject({ run: STOPPED, stage: "build" });
}

async function testKeepsTheOpenDialogAndItsChoice(): Promise<void> {
	const { dialog, page, refuseHistoryRead } = await openReactiveReplayHistory();
	fireEvent.change(within(dialog).getByLabelText("Run"), {
		target: { value: FINISHED },
	});

	refuseHistoryRead();
	focusManager.setFocused(false);
	focusManager.setFocused(true);
	await page.findByText("Could not load run history.");

	expect(page.getByRole("dialog")).toBe(dialog);
	expect(within(dialog).getByLabelText("Run")).toHaveValue(FINISHED);
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	describe("Replay a step", () => {
		describe("when a later read no longer lists the chosen run", () => {
			afterEach(() => {
				focusManager.setFocused(undefined);
			});
			it("returns to the step it opened on", testReturnsToTheStepItOpenedOn);
		});
		describe("when a later read of the history fails", () => {
			afterEach(() => {
				focusManager.setFocused(undefined);
			});
			it(
				"keeps the open dialog and its choice",
				testKeepsTheOpenDialogAndItsChoice,
			);
		});
	});
});
