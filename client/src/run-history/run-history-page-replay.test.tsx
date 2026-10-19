import { describe, expect, it } from "bun:test";

import { fireEvent, waitFor, within } from "@testing-library/react";

import LiveReply from "#client/test-support/live-reply";

import RunHistoryPage from "./run-history-page";
import LaunchRowBuilder from "./run-history-page-launch-row-builder";
import {
	LAUNCH_ID,
	renderHistory,
	serving,
} from "./run-history-page-replay-fixture";
import {
	FINISHED,
	ReplayHistoryBuilder,
	STOPPED,
} from "./run-history-page-replay-history-builder";
import ReplayableRowBuilder from "./run-history-page-replayable-row-builder";
import {
	registerRunHistoryTestCleanup,
	renderPage,
} from "./run-history-page-test-harness";

const FIRST_POSTED_REQUEST_INDEX = 0;

async function testSitsBesideNewRunInTheHeader(): Promise<void> {
	serving();
	const { page, enabledReplayAction } = renderHistory();

	const replay = await enabledReplayAction();

	expect(replay.parentElement).toContainElement(
		page.getByRole("button", { name: "New run" }),
	);
}

async function testOpensOnR(): Promise<void> {
	serving();
	const { page, enabledReplayAction } = renderHistory();
	await enabledReplayAction();

	fireEvent.keyDown(document.body, { key: "r" });

	expect(await page.findByRole("dialog")).toBeInTheDocument();
}

async function testLeavesTheRThatEndsAGRChordToTheChord(): Promise<void> {
	serving();
	const { page, enabledReplayAction } = renderHistory();
	await enabledReplayAction();

	fireEvent.keyDown(document.body, { key: "g" });
	fireEvent.keyDown(document.body, { key: "r" });

	expect(page.queryByRole("dialog")).not.toBeInTheDocument();
}

async function testOpensOnTheNewestStoppedRunSStoppedStep(): Promise<void> {
	serving();
	const { openReplay } = renderHistory();

	const dialog = await openReplay();

	expect(within(dialog).getByLabelText("Run")).toHaveValue(STOPPED);
	expect(within(dialog).getByLabelText("Step")).toHaveValue("build");
}

async function testOffersOnlyTheChosenRunSReplayableSteps(): Promise<void> {
	serving();
	const { openReplay } = renderHistory();
	const dialog = await openReplay();

	const steps = within(within(dialog).getByLabelText("Step"))
		.getAllByRole("option")
		.map((option) => option.textContent);

	expect(steps).toEqual(["plan", "build"]);
}

async function testStartsTheStepItOpensOn(): Promise<void> {
	const server = serving();
	const { openReplay } = renderHistory();
	const dialog = await openReplay();

	fireEvent.click(
		await within(dialog).findByRole("button", { name: "Start · 1 attempt" }),
	);

	await waitFor(() => {
		const expectedPostedCount = 1;

		expect(server.posted("/api/launches")).toHaveLength(expectedPostedCount);
	});
	expect(
		JSON.parse(
			server.posted("/api/launches")[FIRST_POSTED_REQUEST_INDEX]?.body ?? "",
		),
	).toMatchObject({ kind: "replay", run: STOPPED, stage: "build" });
}

async function testChoosesARunSLastOfferedStepWhenTheOperatorChangesToIt(): Promise<void> {
	serving();
	const { openReplay } = renderHistory();
	const dialog = await openReplay();

	fireEvent.change(within(dialog).getByLabelText("Run"), {
		target: { value: FINISHED },
	});

	expect(within(dialog).getByLabelText("Step")).toHaveValue("review");
}

async function testReplaysTheRunAndStepTheOperatorChangesTo(): Promise<void> {
	const server = serving();
	const { openReplay } = renderHistory();
	const dialog = await openReplay();

	fireEvent.change(within(dialog).getByLabelText("Run"), {
		target: { value: FINISHED },
	});
	fireEvent.change(within(dialog).getByLabelText("Step"), {
		target: { value: "plan" },
	});
	fireEvent.click(
		await within(dialog).findByRole("button", { name: "Start · 1 attempt" }),
	);

	await waitFor(() => {
		const expectedPostedCount = 1;

		expect(server.posted("/api/launches")).toHaveLength(expectedPostedCount);
	});
	expect(
		JSON.parse(
			server.posted("/api/launches")[FIRST_POSTED_REQUEST_INDEX]?.body ?? "",
		),
	).toEqual({ attempts: 1, kind: "replay", run: FINISHED, stage: "plan" });
}

async function testListsTheLaunchItStarted(): Promise<void> {
	let launched = false;
	serving(
		new ReplayHistoryBuilder().build(),
		new Map([
			[
				"GET /api/run-listing",
				new LiveReply(() => ({
					body: {
						...new ReplayHistoryBuilder().build(),
						launches: launched
							? [
									new LaunchRowBuilder({
										id: LAUNCH_ID,
										launchedAt: new Date().toISOString(),
										run: STOPPED,
										stage: "build",
										target: "replay",
									}).build(),
								]
							: [],
					},
					status: 200,
				})),
			],
		]),
	);
	const { page, openReplay } = renderHistory();
	const dialog = await openReplay();

	launched = true;
	fireEvent.click(
		await within(dialog).findByRole("button", { name: "Start · 1 attempt" }),
	);

	expect(await page.findByText("launch 9c1d2e3f")).toBeInTheDocument();
}

async function testIsDisabledAndSaysWhyInText(): Promise<void> {
	serving({
		...new ReplayHistoryBuilder().build(),
		rows: [
			new ReplayableRowBuilder({
				replayableStages: [],
				run: FINISHED,
				status: "COMPLETE",
			}).build(),
		],
	});
	const page = renderPage();

	const reason = await page.findByText(
		"No recorded run has a step whose starting checkpoint is recorded",
	);

	expect(reason).toBeVisible();
	expect(page.getByRole("button", { name: "Replay a step" })).toBeDisabled();
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	describe("Replay a step", () => {
		it("sits beside New run in the header", testSitsBesideNewRunInTheHeader);
		it("opens on r", testOpensOnR);
		it(
			"leaves the r that ends a g r chord to the chord",
			testLeavesTheRThatEndsAGRChordToTheChord,
		);
		it(
			"opens on the newest stopped run's stopped step",
			testOpensOnTheNewestStoppedRunSStoppedStep,
		);
		it(
			"offers only the chosen run's replayable steps",
			testOffersOnlyTheChosenRunSReplayableSteps,
		);
		it("starts the step it opens on", testStartsTheStepItOpensOn);
		it(
			"chooses a run's last offered step when the operator changes to it",
			testChoosesARunSLastOfferedStepWhenTheOperatorChangesToIt,
		);
		it(
			"replays the run and step the operator changes to",
			testReplaysTheRunAndStepTheOperatorChangesTo,
		);
		it("lists the launch it started", testListsTheLaunchItStarted);
		describe("when no recorded run offers a step", () => {
			it("is disabled and says why in text", testIsDisabledAndSaysWhyInText);
		});
	});
});
