import { describe, expect, it } from "bun:test";

import { within } from "@testing-library/react";

import recordMoment from "./record-moment";
import RunHistoryPage from "./run-history-page";
import NamedHistoryBuilder from "./run-history-page-named-history-builder";
import { cellOf } from "./run-history-page-test-driver";
import {
	registerRunHistoryTestCleanup,
	renderPage,
	respondingWith,
} from "./run-history-page-test-harness";

const named = new NamedHistoryBuilder().build();

async function testNamesEachRecordByItsShortIdWithinItsCaseWithWhenItRanBeneath(): Promise<void> {
	respondingWith(named);

	await renderPage().findByText("g4");

	for (const [shortId, ran] of [
		["r7", "2026-09-07T00:00:00.000Z"],
		["r6", "2026-09-06T22:33:15.057Z"],
	] as const) {
		expect(cellOf({ column: "Run", run: shortId })).toHaveTextContent(
			`${shortId}${recordMoment(Date.parse(ran), Date.now())}`,
		);
	}
}

async function testLinksAPipelineRunSShortIdToItsRunDetail(): Promise<void> {
	respondingWith(named);

	const page = renderPage();

	expect(await page.findByRole("link", { name: "r7" })).toHaveAttribute(
		"href",
		"/runs/2026-09-07T00-00-00.000Z?view=activity",
	);
}

async function testOpensAReplaySContextFromItsShortId(): Promise<void> {
	respondingWith(named);

	const page = renderPage();

	expect(await page.findByRole("link", { name: "r6" })).toHaveAttribute(
		"href",
		"/replays/60758c/2026-09-06T22-33-15.057Z",
	);
}

async function testOpensAConfirmationGroupFromItsId(): Promise<void> {
	respondingWith(named);

	await renderPage().findByText("g4");

	expect(
		within(cellOf({ column: "Run", run: "g4" })).getByRole("link"),
	).toHaveAttribute("href", "/groups/group-a");
}

async function testNamesTheCheckpointAReplayStartedFromWithinItsCaseAndWhichAttemptThereItIs(): Promise<void> {
	respondingWith(named);

	await renderPage().findByText("g4");

	expect(cellOf({ column: "Case", run: "r6" })).toHaveTextContent(
		"replay build · r2/s1 · attempt 2 of 3",
	);
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	describe("when records carry short ids", () => {
		it(
			"names each record by its short id within its case, with when it ran beneath",
			testNamesEachRecordByItsShortIdWithinItsCaseWithWhenItRanBeneath,
		);

		it(
			"links a pipeline run's short id to its run detail",
			testLinksAPipelineRunSShortIdToItsRunDetail,
		);

		it(
			"opens a replay's context from its short id",
			testOpensAReplaySContextFromItsShortId,
		);

		it(
			"opens a confirmation group from its id",
			testOpensAConfirmationGroupFromItsId,
		);

		it(
			"names the checkpoint a replay started from within its case and which attempt there it is",
			testNamesTheCheckpointAReplayStartedFromWithinItsCaseAndWhichAttemptThereItIs,
		);
	});
});
