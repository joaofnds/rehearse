import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import NamedHistoryBuilder from "#client/run-history/run-history-page-named-history-builder";
import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import { renderAppWithStub } from "#client/test-support/render-app";
import {
	RunRecordBuilder,
	RunRecordStageBuilder,
} from "#client/test-support/run-detail";

import {
	EMPTY_COLLECTION_LENGTH,
	IN_FLIGHT,
	NEWER,
	OLDER,
	bar,
	originalFetch,
	renderBarWithLaunch,
	renderRunInFlight,
	servingListing,
} from "./in-flight-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("the run in flight on every screen", () => {
	it(
		"shows nothing on a screen when no run is in flight",
		showsNothingOnAScreenWhenNoRunIsInFlight,
	);

	it("leaves when the run ends", leavesWhenTheRunEnds);

	it(
		"shows a bar for each run in flight, the newest first",
		showsABarForEachRunInFlightTheNewestFirst,
	);

	it(
		"opens its run's Activity from any screen",
		opensItsRunSActivityFromAnyScreen,
	);

	it(
		"shows a run launched from the browser without waiting for a poll",
		showsARunLaunchedFromTheBrowserWithoutWaitingForAPoll,
	);
});

async function showsNothingOnAScreenWhenNoRunIsInFlight(): Promise<void> {
	renderAppWithStub("/corpus", new Map());

	await screen.findByRole("navigation", { name: "Sections" });
	expect(
		screen.queryByRole("region", { name: IN_FLIGHT }),
	).not.toBeInTheDocument();
}

function leavesWhenTheRunEnds(): void {
	const { rerender } = renderRunInFlight([
		new PipelineRunRowBuilder({}).withExecutionProgress().build(),
	]);
	expect(bar()).toBeInTheDocument();

	rerender([
		new PipelineRunRowBuilder({ status: "COMPLETE" })
			.withExecutionProgress()
			.build(),
	]);

	expect(
		screen.queryByRole("region", { name: IN_FLIGHT }),
	).not.toBeInTheDocument();
}

async function showsABarForEachRunInFlightTheNewestFirst(): Promise<void> {
	const expectedBarCount = 2;

	const fetchReplies = new Map([
		[
			"/api/run-listing",
			new NamedHistoryBuilder({
				rows: [
					{
						...new PipelineRunRowBuilder({ run: OLDER })
							.withExecutionProgress()
							.build(),
						shortId: "r-0147",
					},
					{
						...new PipelineRunRowBuilder({ run: NEWER })
							.withExecutionProgress({ stage: "review" })
							.build(),
						shortId: "r-0149",
					},
				],
			}).build(),
		],
	]);
	renderAppWithStub("/corpus", fetchReplies);

	const bars = await screen.findAllByRole("region", { name: IN_FLIGHT });

	const [observedFirstBar, observedSecondBar] = bars;

	expect(bars).toHaveLength(expectedBarCount);
	expect(observedFirstBar).toHaveAccessibleName("Run r-0149 in flight");
	expect(observedSecondBar).toHaveAccessibleName("Run r-0147 in flight");
}

async function opensItsRunSActivityFromAnyScreen(): Promise<void> {
	const older = {
		...new PipelineRunRowBuilder({ run: OLDER })
			.withExecutionProgress()
			.build(),
		shortId: "r-0147",
	};
	const listing = new NamedHistoryBuilder({
		rows: [
			older,
			{
				...new PipelineRunRowBuilder({ run: NEWER })
					.withExecutionProgress()
					.build(),
				shortId: "r-0149",
			},
		],
	}).build();
	const fetchReplies = new Map<string, unknown>([
		["/api/runs", listing],
		["/api/run-listing", listing],
		[
			`/api/runs/${OLDER}`,
			new RunRecordBuilder({
				run: OLDER,
				stages: [new RunRecordStageBuilder().build()],
			}).build(),
		],
	]);
	renderAppWithStub("/corpus", fetchReplies);
	const shown = await screen.findByRole("region", {
		name: "Run r-0147 in flight",
	});

	fireEvent.click(within(shown).getByRole("link", { name: "Open activity" }));

	expect(
		await screen.findByRole("region", { name: "Run workspace" }),
	).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Activity" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	expect(
		within(screen.getByRole("navigation", { name: "Sections" })).getByRole(
			"link",
			{ name: /^Runs/u },
		),
	).toHaveAttribute("aria-current", "page");
}

async function showsARunLaunchedFromTheBrowserWithoutWaitingForAPoll(): Promise<void> {
	const server = servingListing(
		() =>
			server.posted("/api/launches").length === EMPTY_COLLECTION_LENGTH
				? []
				: [
						new PipelineRunRowBuilder({ launchId: "launch-1" })
							.withExecutionProgress()
							.build(),
					],
		new Map([
			["POST /api/launches", { body: { id: "launch-1" }, status: 202 }],
		]),
	);
	renderBarWithLaunch();
	fireEvent.click(screen.getByRole("button", { name: "New run" }));
	const start = await screen.findByRole("button", { name: /^Start · /u });
	await waitFor(() => {
		expect(start).toBeEnabled();
	});

	fireEvent.click(start);

	expect(
		await screen.findByRole("region", { name: IN_FLIGHT }),
	).toBeInTheDocument();
}
