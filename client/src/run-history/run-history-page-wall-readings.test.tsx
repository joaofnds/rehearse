import { describe, expect, it } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import type { PipelineRunRow } from "#server/run-history";

import RunHistoryPage from "./run-history-page";
import PipelineRunRowBuilder from "./run-history-page-pipeline-row-builder";
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

const RECORDED_WALL_TIME_KINDS = KINDS;

const RESOURCE_COLUMNS = ["Cost", "Wall"] as const;

async function testAlignsTheCostAndWallTimeOnTheCellSRightEdge(): Promise<void> {
	respondingWith(
		new ResourceHistoryBuilder({ cost: SPENT, wallTime: SIX_TWELVE }).build(),
	);

	await renderPage().findByText(RUN);

	expect(cellOf({ column: "Cost", run: RUN })).toHaveAttribute("data-numeric");
	expect(cellOf({ column: "Wall", run: RUN })).toHaveAttribute("data-numeric");
}

async function testReadsAnUnavailableWallTimeAsUnrecordedAndKeepsWhyForARequest(): Promise<void> {
	respondingWith(
		new ResourceHistoryBuilder({
			cost: SPENT,
			wallTime: { reasons: ["no run events"], state: "unavailable" },
		}).build(),
	);

	await renderPage().findByText(RUN);

	expect(cellOf({ column: "Wall", run: RUN }).textContent).toBe(
		"unrecordedwhy",
	);
}

async function testShowsWhyAWallTimeIsUnrecordedOnRequest(): Promise<void> {
	respondingWith(
		new ResourceHistoryBuilder({
			cost: SPENT,
			wallTime: { reasons: ["no run events"], state: "unavailable" },
		}).build(),
	);
	await renderPage().findByText(RUN);

	fireEvent.click(
		within(cellOf({ column: "Wall", run: RUN })).getByRole("button", {
			name: "why",
		}),
	);

	expect(cellOf({ column: "Wall", run: RUN }).textContent).toBe(
		"unrecordedhideno run events",
	);
}

async function testReadsRecordedWallTime(
	_kind: string,
	identity: string,
): Promise<void> {
	respondingWith(
		new ResourceHistoryBuilder({ cost: SPENT, wallTime: SIX_TWELVE }).build(),
	);

	await renderPage().findByText(identity);

	expect(cellOf({ column: "Wall", run: identity }).textContent).toBe("06:12");
}

async function testKeepsUnrecordedReasonsWithTheirRow(
	column: string,
): Promise<void> {
	const unrecorded: PipelineRunRow["cost"] = {
		reasons: ["no call metrics"],
		state: "unavailable",
	};
	respondingWith({
		launches: [],
		rows: [
			new PipelineRunRowBuilder({
				cost: unrecorded,
				run: RUN,
				stage: "build",
				status: "COMPLETE",
			}).build(),
			new PipelineRunRowBuilder({
				cost: unrecorded,
				run: STOPPED_RUN,
				stage: "build",
				status: "STOPPED:build",
			}).build(),
		],
		unreadable: [],
	});
	await renderPage().findByText(RUN);

	fireEvent.click(
		within(cellOf({ column, run: RUN })).getByRole("button", { name: "why" }),
	);
	fireEvent.click(screen.getByRole("button", { name: "Stopped" }));

	expect(
		within(cellOf({ column, run: STOPPED_RUN })).getByRole("button", {
			name: "why",
		}),
	).toHaveAttribute("aria-expanded", "false");
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	describe("the cost and wall time of a record", () => {
		it.each(RECORDED_WALL_TIME_KINDS)(
			"reads a %s's wall time as minutes and seconds",
			testReadsRecordedWallTime,
		);
		it(
			"aligns the cost and wall time on the cell's right edge",
			testAlignsTheCostAndWallTimeOnTheCellSRightEdge,
		);
		it.each([...RESOURCE_COLUMNS])(
			"does not carry one row's open unrecorded %s reasons onto another when the filter changes the rows",
			testKeepsUnrecordedReasonsWithTheirRow,
		);
		it(
			"reads an unavailable wall time as unrecorded and keeps why for a request",
			testReadsAnUnavailableWallTimeAsUnrecordedAndKeepsWhyForARequest,
		);
		it(
			"shows why a wall time is unrecorded on request",
			testShowsWhyAWallTimeIsUnrecordedOnRequest,
		);
	});
});
