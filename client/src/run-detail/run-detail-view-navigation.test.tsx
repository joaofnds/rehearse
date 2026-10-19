import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import NamedHistoryBuilder from "#client/run-history/run-history-page-named-history-builder";
import AnalysisReadingBuilder from "#client/test-support/analysis-reading-test-builder";
import { renderAppWithStub } from "#client/test-support/render-app";
import {
	ANALYSES,
	RUN,
	renderRunDetail,
	stoppedAtBuild,
	stoppedRow,
} from "#client/test-support/run-detail";

import { originalFetch } from "./run-detail-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("/runs/$run", () => {
	it(
		"opens Results on the step it stopped at, with its replay action",
		opensResultsOnTheStepItStoppedAtWithItsReplayAction,
	);

	it(
		"restores the layout and step the URL names",
		restoresTheLayoutAndStepTheURLNames,
	);

	it("writes the chosen view to the URL", writesTheChosenViewToTheURL);

	it(
		"writes the view chosen with the step it shows",
		writesTheViewChosenWithTheStepItShows,
	);

	it(
		"falls back to Results on the stopped step for a view or step it does not know",
		fallsBackToResultsOnTheStoppedStepForAViewOrStepItDoesNotKnow,
	);

	it(
		"opens a run that did not stop on the last step with a record",
		opensARunThatDidNotStopOnTheLastStepWithARecord,
	);

	it(
		"says no recorded run has an id that run history does not list",
		saysNoRecordedRunHasAnIdThatRunHistoryDoesNotList,
	);
});

async function opensResultsOnTheStepItStoppedAtWithItsReplayAction(): Promise<void> {
	const fetchReplies = new Map([
		[
			"/api/runs",
			new NamedHistoryBuilder({
				rows: [{ ...stoppedRow(), replayableStages: ["shape", "build"] }],
			}).build(),
		],
	]);
	renderRunDetail(fetchReplies);

	const switcher = await screen.findByRole("group", {
		name: "Run views",
	});

	expect(
		within(switcher)
			.getAllByRole("button")
			.map((option) => [
				option.textContent,
				option.getAttribute("aria-pressed"),
			]),
	).toEqual([
		["Results", "true"],
		["Activity", "false"],
		["Context & cost", "false"],
	]);
	expect(
		within(screen.getByRole("region", { name: "Step report" })).getByRole(
			"heading",
			{ level: 2, name: "Step 2 · build" },
		),
	).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "Replay step 2" }),
	).toBeInTheDocument();
}

async function restoresTheLayoutAndStepTheURLNames(): Promise<void> {
	renderRunDetail(new Map(), [], `/runs/${RUN}?layout=rail&step=shape`);

	expect(
		await screen.findByRole("heading", { level: 2, name: "Step 1 · shape" }),
	).toBeInTheDocument();
}

async function writesTheChosenViewToTheURL(): Promise<void> {
	const router = renderRunDetail(
		new Map([
			[ANALYSES, new AnalysisReadingBuilder().withoutAnalysis().build()],
		]),
		[],
		`/runs/${RUN}?step=shape`,
	);

	fireEvent.click(await screen.findByRole("button", { name: "Activity" }));

	await waitFor(() => {
		expect(screen.getByRole("button", { name: "Activity" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
	});
	expect(router.state.location.search).toEqual({
		step: "shape",
		view: "activity",
	});
}

async function writesTheViewChosenWithTheStepItShows(): Promise<void> {
	const router = renderRunDetail();

	fireEvent.click(
		await screen.findByRole("button", { name: "Context & cost" }),
	);

	await waitFor(() => {
		expect(router.state.location.search).toEqual({
			step: "build",
			view: "context",
		});
	});
}

async function fallsBackToResultsOnTheStoppedStepForAViewOrStepItDoesNotKnow(): Promise<void> {
	renderRunDetail(new Map(), [], `/runs/${RUN}?view=matrix&step=deploy`);

	expect(
		await screen.findByRole("heading", { level: 2, name: "Step 2 · build" }),
	).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Results" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
}

async function opensARunThatDidNotStopOnTheLastStepWithARecord(): Promise<void> {
	const fetchReplies = new Map<string, unknown>([
		[
			"/api/runs",
			new NamedHistoryBuilder({
				rows: [{ ...stoppedRow(), status: "SUCCESSFUL" }],
			}).build(),
		],
		[`/api/runs/${RUN}`, stoppedAtBuild()],
	]);
	renderAppWithStub(`/runs/${RUN}`, fetchReplies);

	expect(
		await screen.findByRole("heading", { level: 2, name: "Step 2 · build" }),
	).toBeInTheDocument();
}

async function saysNoRecordedRunHasAnIdThatRunHistoryDoesNotList(): Promise<void> {
	const fetchResponses = new Map([
		["/api/runs", new NamedHistoryBuilder({ rows: [stoppedRow()] }).build()],
	]);
	renderAppWithStub("/runs/2026-01-01T00-00-00.000Z", fetchResponses);

	expect(
		await screen.findByRole("heading", {
			name: "No recorded run has this id",
		}),
	).toBeInTheDocument();
}
