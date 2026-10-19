import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, waitFor, within } from "@testing-library/react";

import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";

import { LaunchDialog } from "./launch-dialog";
import {
	COMPARISON,
	EXTENSION,
	FIRST_POSTED_REQUEST_INDEX,
	openDialog,
	originalFetch,
	serving,
	startButton,
} from "./launch-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(LaunchDialog.name, () => {
	describe("when comparing two recorded attempts", () => {
		it(
			"names both arms and the checkpoint the control group replays",
			namesBothArmsAndTheCheckpointTheControlGroupReplays,
		);

		it(
			"states the control group's ceiling at the baseline's group size, which it offers no choice of",
			statesTheControlGroupSCeilingAtTheBaselineSGroupSizeWhichItOffersNoChoiceOf,
		);

		it("posts the two arms when started", postsTheTwoArmsWhenStarted);
	});

	describe("when adding attempts to a saved comparison", () => {
		it(
			"states what the added attempts cost before anything starts",
			statesWhatTheAddedAttemptsCostBeforeAnythingStarts,
		);

		it(
			"posts the comparison with the cost it stated",
			postsTheComparisonWithTheCostItStated,
		);
	});
});

async function namesBothArmsAndTheCheckpointTheControlGroupReplays(): Promise<void> {
	serving();

	const dialog = await openDialog(COMPARISON);

	expect(
		within(dialog).getByText("build-checkpoint-baseline"),
	).toBeInTheDocument();
	expect(
		within(dialog).getByText("build-checkpoint-candidate"),
	).toBeInTheDocument();
	expect(
		within(dialog).getByText("2026-09-06T21-58-29.508Z"),
	).toBeInTheDocument();
	expect(
		within(dialog).getByText(
			"baseline's corpus without the one skill that differs",
		),
	).toBeInTheDocument();
}

async function statesTheControlGroupSCeilingAtTheBaselineSGroupSizeWhichItOffersNoChoiceOf(): Promise<void> {
	serving();

	const dialog = await openDialog(COMPARISON);

	expect(
		await within(dialog).findByText(
			"Ceiling $5.00 per attempt, $10.00 for the group of 2 · stops mid-step if reached, and can be overrun by the calls in flight",
		),
	).toBeInTheDocument();
	expect(
		within(dialog).queryByRole("group", { name: "Attempts" }),
	).not.toBeInTheDocument();
	expect(
		within(dialog).getByRole("button", { name: "Start · 2 attempts" }),
	).toBeInTheDocument();
}

async function postsTheTwoArmsWhenStarted(): Promise<void> {
	const server = serving();
	await openDialog(COMPARISON);

	fireEvent.click(await startButton());

	await waitFor(() => {
		const expectedPostedCount = 1;

		expect(server.posted("/api/launches")).toHaveLength(expectedPostedCount);
	});
	expect(
		JSON.parse(
			server.posted("/api/launches")[FIRST_POSTED_REQUEST_INDEX]?.body ?? "",
		),
	).toEqual({
		armA: "build-checkpoint-baseline",
		armB: "build-checkpoint-candidate",
		kind: "comparison",
	});
}

async function statesWhatTheAddedAttemptsCostBeforeAnythingStarts(): Promise<void> {
	serving();

	const dialog = await openDialog(EXTENSION);

	expect(
		within(dialog).getByText(
			"about $9.00, at each arm's mean recorded cost per attempt",
		),
	).toBeInTheDocument();
	expect(
		within(dialog).queryByRole("group", { name: "Attempts" }),
	).not.toBeInTheDocument();
	expect(
		within(dialog).getByRole("button", { name: "Start · 6 attempts" }),
	).toBeInTheDocument();
	expect(
		within(dialog).getByText(/for each of the 3 groups of 2 ·/u),
	).toBeInTheDocument();
}

async function postsTheComparisonWithTheCostItStated(): Promise<void> {
	const server = serving();
	await openDialog(EXTENSION);

	fireEvent.click(await startButton());

	await waitFor(() => {
		const expectedPostedCount = 1;

		expect(server.posted("/api/launches")).toHaveLength(expectedPostedCount);
	});
	expect(
		JSON.parse(
			server.posted("/api/launches")[FIRST_POSTED_REQUEST_INDEX]?.body ?? "",
		),
	).toEqual({
		attempts: 2,
		comparison: "a".repeat(SHA256_HEX_CHARACTERS),
		kind: "extension",
		statedUsd: 9,
	});
}
