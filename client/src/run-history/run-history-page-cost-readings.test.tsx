import { describe, expect, it } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import RunHistoryPage from "./run-history-page";
import PipelineRunRowBuilder from "./run-history-page-pipeline-row-builder";
import costMissingPart from "./run-history-page-pipeline-test-data";
import {
	ResourceHistoryBuilder,
	SIX_TWELVE,
	SPENT,
} from "./run-history-page-resource-history-builder";
import { cellOf } from "./run-history-page-test-driver";
import {
	registerRunHistoryTestCleanup,
	renderPage,
	respondingWith,
} from "./run-history-page-test-harness";

const RUN = "2026-09-20T10-00-00.000Z";

const ATTEMPT = "0f6b6f2a-0000-4000-8000-000000000009";

const REPLAY = "2026-09-21T09-20-00.000Z";

const GROUP = "group-0143";

const STOPPED_RUN = "2026-09-05T00-00-00.000Z";

const KINDS = [
	["pipeline run", RUN],
	["session attempt", ATTEMPT],
	["replay", REPLAY],
	["confirmation group", GROUP],
] as const;

const RECORDED_COST_KINDS = KINDS;

async function testMarksACostWithMissingPartsAsPartial(): Promise<void> {
	respondingWith(
		new ResourceHistoryBuilder({
			cost: {
				...SPENT,
				missing: [
					{ part: "Product Owner", reason: "no main artifact" },
					{ part: "rep-2", reason: "no metrics" },
				],
			},
			wallTime: SIX_TWELVE,
		}).build(),
	);

	await renderPage().findByText(RUN);

	expect(cellOf({ column: "Cost", run: RUN }).textContent).toBe(
		"$2.41partialwhy",
	);
}

async function testShowsWhyEachPartTheCostLacksIsMissingOnRequest(): Promise<void> {
	respondingWith(
		new ResourceHistoryBuilder({
			cost: {
				...SPENT,
				missing: [
					{ part: "Product Owner", reason: "no main artifact" },
					{ part: "rep-2", reason: "no metrics" },
				],
			},
			wallTime: SIX_TWELVE,
		}).build(),
	);
	await renderPage().findByText(RUN);

	fireEvent.click(
		within(cellOf({ column: "Cost", run: RUN })).getByRole("button", {
			name: "why",
		}),
	);

	expect(cellOf({ column: "Cost", run: RUN }).textContent).toBe(
		"$2.41partialhideProduct Owner: no main artifactrep-2: no metrics",
	);
}

async function testDoesNotCarryOneRowSOpenCostReasonsOntoAnotherWhenTheFilterChangesTheRows(): Promise<void> {
	respondingWith({
		launches: [],
		rows: [
			new PipelineRunRowBuilder({
				cost: costMissingPart("Product Owner"),
				run: RUN,
				stage: "build",
				status: "COMPLETE",
			}).build(),
			new PipelineRunRowBuilder({
				cost: costMissingPart("rep-2"),
				run: STOPPED_RUN,
				stage: "build",
				status: "STOPPED:build",
			}).build(),
		],
		unreadable: [],
	});
	await renderPage().findByText(RUN);

	fireEvent.click(
		within(cellOf({ column: "Cost", run: RUN })).getByRole("button", {
			name: "why",
		}),
	);
	fireEvent.click(screen.getByRole("button", { name: "Stopped" }));

	expect(
		within(cellOf({ column: "Cost", run: STOPPED_RUN })).getByRole("button", {
			name: "why",
		}),
	).toHaveAttribute("aria-expanded", "false");
}

async function testReadsAnUnavailableCostAsUnrecordedAndKeepsWhyForARequest(): Promise<void> {
	respondingWith(
		new ResourceHistoryBuilder({
			cost: { reasons: ["no call metrics"], state: "unavailable" },
			wallTime: SIX_TWELVE,
		}).build(),
	);

	await renderPage().findByText(RUN);

	expect(cellOf({ column: "Cost", run: RUN }).textContent).toBe(
		"unrecordedwhy",
	);
}

async function testShowsWhyACostIsUnrecordedOnRequest(): Promise<void> {
	respondingWith(
		new ResourceHistoryBuilder({
			cost: { reasons: ["no call metrics"], state: "unavailable" },
			wallTime: SIX_TWELVE,
		}).build(),
	);
	await renderPage().findByText(RUN);

	fireEvent.click(
		within(cellOf({ column: "Cost", run: RUN })).getByRole("button", {
			name: "why",
		}),
	);

	expect(cellOf({ column: "Cost", run: RUN }).textContent).toBe(
		"unrecordedhideno call metrics",
	);
}

async function testReadsRecordedCost(
	_kind: string,
	identity: string,
): Promise<void> {
	respondingWith(
		new ResourceHistoryBuilder({ cost: SPENT, wallTime: SIX_TWELVE }).build(),
	);

	await renderPage().findByText(identity);

	expect(cellOf({ column: "Cost", run: identity }).textContent).toBe("$2.41");
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	describe("the cost and wall time of a record", () => {
		it.each(RECORDED_COST_KINDS)(
			"reads a %s's recorded cost in dollars",
			testReadsRecordedCost,
		);
		it(
			"marks a cost with missing parts as partial",
			testMarksACostWithMissingPartsAsPartial,
		);
		it(
			"shows why each part the cost lacks is missing on request",
			testShowsWhyEachPartTheCostLacksIsMissingOnRequest,
		);
		it(
			"does not carry one row's open cost reasons onto another when the filter changes the rows",
			testDoesNotCarryOneRowSOpenCostReasonsOntoAnotherWhenTheFilterChangesTheRows,
		);
		it(
			"reads an unavailable cost as unrecorded and keeps why for a request",
			testReadsAnUnavailableCostAsUnrecordedAndKeepsWhyForARequest,
		);
		it(
			"shows why a cost is unrecorded on request",
			testShowsWhyACostIsUnrecordedOnRequest,
		);
	});
});
