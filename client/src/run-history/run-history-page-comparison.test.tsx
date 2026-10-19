import { describe, expect, it } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import { stubFetchByPath } from "#client/test-support/fetch-stub";

import RunHistoryPage from "./run-history-page";
import ConfirmationGroupRowBuilder from "./run-history-page-group-row-builder";
import { comparisonChoice } from "./run-history-page-test-driver";
import {
	registerRunHistoryTestCleanup,
	renderPage,
	respondingWith,
} from "./run-history-page-test-harness";
import type { RunHistoryResponse as RunHistoryResponseBody } from "./run-history-query";

const RUN = "2026-09-06T21-58-29.508Z";

const history: RunHistoryResponseBody = {
	launches: [],
	rows: [
		new ConfirmationGroupRowBuilder({
			checkpoint: { run: RUN, stage: "build" },
			groupId: "group-without-skill",
			mode: "stage",
			reps: 3,
		}).build(),
		new ConfirmationGroupRowBuilder({
			checkpoint: { run: RUN, stage: "build" },
			groupId: "group-with-skill",
			mode: "stage",
			reps: 3,
		}).build(),
		new ConfirmationGroupRowBuilder({
			checkpoint: { run: RUN, stage: "shape" },
			groupId: "group-at-shape",
			mode: "stage",
			reps: 3,
		}).build(),
		new ConfirmationGroupRowBuilder({
			checkpoint: undefined,
			groupId: "group-unplaced",
			mode: "stage",
			reps: 3,
		}).build(),
	],
	unreadable: [],
};

async function testOffersToCompareOnlyGroupsWhoseCheckpointIsRecorded(): Promise<void> {
	respondingWith(history);

	await renderPage().findByText("group-unplaced");

	expect(comparisonChoice("group-without-skill")).toBeInTheDocument();
	expect(
		screen.queryByRole("checkbox", { name: "Compare group-unplaced" }),
	).not.toBeInTheDocument();
}

async function testOnceOneIsChosenOffersOnlyGroupsReplayedAtItsCheckpoint(): Promise<void> {
	respondingWith(history);
	await renderPage().findByText("group-unplaced");

	fireEvent.click(comparisonChoice("group-without-skill"));

	expect(comparisonChoice("group-with-skill")).toBeEnabled();
	expect(comparisonChoice("group-at-shape")).toBeDisabled();
	expect(
		screen.queryByRole("button", { name: "Compare these attempts" }),
	).not.toBeInTheDocument();
}

async function testComparesTheFirstChosenAsArmAAndTheSecondAsArmB(): Promise<void> {
	stubFetchByPath(
		new Map<string, unknown>([
			["/api/run-listing", history],
			[
				"/api/settings",
				{
					linkedCorpus: { kind: "live", root: "/home/.claude" },
					overrun: "The ceiling can be overrun by the calls in flight.",
					recordsDirectory: "/records",
					setCommand: "rehearse settings --spend-ceiling-usd <USD>",
					spendCeilingUsd: 5,
				},
			],
		]),
	);
	await renderPage().findByText("group-unplaced");

	fireEvent.click(comparisonChoice("group-without-skill"));
	fireEvent.click(comparisonChoice("group-with-skill"));
	fireEvent.click(
		screen.getByRole("button", { name: "Compare these attempts" }),
	);
	const dialog = await screen.findByRole("dialog");

	expect(
		within(dialog).getByText("Baseline (before)").nextElementSibling,
	).toHaveTextContent("group-without-skill");
	expect(
		within(dialog).getByText("Candidate (after)").nextElementSibling,
	).toHaveTextContent("group-with-skill");
	expect(
		within(dialog).getByRole("button", { name: "Start · 3 attempts" }),
	).toBeInTheDocument();
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	describe("when two recorded attempts are compared", () => {
		it(
			"offers to compare only groups whose checkpoint is recorded",
			testOffersToCompareOnlyGroupsWhoseCheckpointIsRecorded,
		);

		it(
			"once one is chosen, offers only groups replayed at its checkpoint",
			testOnceOneIsChosenOffersOnlyGroupsReplayedAtItsCheckpoint,
		);

		it(
			"compares the first chosen as arm A and the second as arm B",
			testComparesTheFirstChosenAsArmAAndTheSecondAsArmB,
		);
	});
});
