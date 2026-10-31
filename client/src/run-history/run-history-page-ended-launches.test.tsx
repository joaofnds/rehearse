import { describe, expect, it } from "bun:test";

import { fireEvent, screen } from "@testing-library/react";

import RunHistoryPage from "./run-history-page";
import LaunchRowBuilder from "./run-history-page-launch-row-builder";
import { cellOf } from "./run-history-page-test-driver";
import {
	registerRunHistoryTestCleanup,
	renderPage,
	respondingWith,
} from "./run-history-page-test-harness";

const REFUSAL = "backlog contains a link, so it is not workflow state";

function respondingWithOneStoppedAndOneEnded(): void {
	respondingWith({
		launches: [
			new LaunchRowBuilder({
				id: "6c4d8e0f-0000-4000-8000-000000000000",
				status: "OPERATOR_STOPPED",
			}).build(),
			new LaunchRowBuilder().buildEnded(REFUSAL),
		],
		rows: [],
		unreadable: [],
	});
}

async function openEndedLaunchHistory(): Promise<void> {
	fireEvent.click(
		await screen.findByRole("button", {
			name: "Ended launch history (2, 1 with a reason)",
		}),
	);
}

async function testShowsHowALaunchThatEndedByAnErrorEnded(): Promise<void> {
	respondingWithOneStoppedAndOneEnded();
	renderPage();

	await openEndedLaunchHistory();

	const outcome = cellOf({ column: "Execution", run: "launch 7b0c2d4e" });
	expect(outcome).toHaveTextContent(REFUSAL);
	expect(outcome).not.toHaveTextContent("stopped by the operator");
}

async function testMarksItEndedAsAStoppedRunIsNeverAsAFailure(): Promise<void> {
	respondingWithOneStoppedAndOneEnded();
	renderPage();

	await openEndedLaunchHistory();

	const status = screen.getByText("ended").parentElement;
	expect(status).toHaveTextContent(/^◼\s*ended$/u);
	expect(status).toHaveClass("text-attention");
}

async function testKeepsAStoppedLaunchStoppedByTheOperator(): Promise<void> {
	respondingWithOneStoppedAndOneEnded();
	renderPage();

	await openEndedLaunchHistory();

	expect(
		cellOf({ column: "Execution", run: "launch 6c4d8e0f" }),
	).toHaveTextContent("stopped by the operator");
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	describe("when a browser launch ended by an error", () => {
		it(
			"shows how it ended in ended launch history",
			testShowsHowALaunchThatEndedByAnErrorEnded,
		);

		it(
			"marks it ended as a stopped run is, never as a failure",
			testMarksItEndedAsAStoppedRunIsNeverAsAFailure,
		);

		it(
			"keeps a launch the operator stopped as stopped by the operator",
			testKeepsAStoppedLaunchStoppedByTheOperator,
		);
	});
});
