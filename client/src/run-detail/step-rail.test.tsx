import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { RUN, renderRunDetail } from "#client/test-support/run-detail";

import {
	originalFetch,
	stepButtons,
	stoppedWithFigures,
} from "./step-report-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("the selected step in Results", () => {
	it(
		"lists every stage in order with its number, name, grade, status, checkpoint, wall time and cost",
		listsEveryStageInOrderWithItsNumberNameGradeStatusCheckpointWallTimeAndCost,
	);
	it(
		"reads the stopped and unreached steps without queued wording",
		readsStoppedAndUnreachedStepStatus,
	);

	it(
		"marks the selected stage as the current step",
		marksTheSelectedStageAsTheCurrentStep,
	);

	it(
		"shows the report of the stage chosen and writes it to the URL",
		showsTheReportOfTheStageChosenAndWritesItToTheURL,
	);
});

async function listsEveryStageInOrderWithItsNumberNameGradeStatusCheckpointWallTimeAndCost(): Promise<void> {
	renderRunDetail(new Map([[`/api/runs/${RUN}`, stoppedWithFigures()]]));

	const graph = await screen.findByRole("region", { name: "Task graph" });
	fireEvent.click(
		within(graph).getByRole("button", { name: "Show workflow details" }),
	);
	const [first] = await stepButtons();

	expect(first).toHaveTextContent(/^01shapeA✓Continued at minimum B/u);
	expect(first).toHaveTextContent("$1.12");
	expect(first).toHaveTextContent("4m02s");
	expect(first).toHaveTextContent("c-0147-1");
}

async function readsStoppedAndUnreachedStepStatus(): Promise<void> {
	renderRunDetail(new Map([[`/api/runs/${RUN}`, stoppedWithFigures()]]));

	const graph = await screen.findByRole("region", { name: "Task graph" });
	fireEvent.click(
		within(graph).getByRole("button", { name: "Show workflow details" }),
	);
	const [, second, third] = await stepButtons();

	expect(second).toHaveTextContent(/^02buildD/u);
	expect(second).toHaveTextContent("stopped");
	expect(third).toHaveTextContent(/^03verify/u);
	expect(third).toHaveTextContent("never ran");
	expect(third).not.toHaveTextContent("queued");
}

async function marksTheSelectedStageAsTheCurrentStep(): Promise<void> {
	renderRunDetail();

	const graph = await screen.findByRole("region", { name: "Task graph" });
	fireEvent.click(
		within(graph).getByRole("button", { name: "Show workflow details" }),
	);
	const buttons = await stepButtons();

	expect(buttons.map((button) => button.getAttribute("aria-current"))).toEqual([
		null,
		"step",
		null,
	]);
}

async function showsTheReportOfTheStageChosenAndWritesItToTheURL(): Promise<void> {
	const router = renderRunDetail();

	const graph = await screen.findByRole("region", { name: "Task graph" });
	fireEvent.click(
		within(graph).getByRole("button", { name: "Show workflow details" }),
	);
	await stepButtons();

	fireEvent.click(screen.getByRole("button", { name: /^shape/u }));

	expect(
		await screen.findByRole("heading", { level: 2, name: "Step 1 · shape" }),
	).toBeInTheDocument();
	await waitFor(() => {
		expect(router.state.location.search).toEqual({
			step: "shape",
			view: "results",
		});
	});
}
