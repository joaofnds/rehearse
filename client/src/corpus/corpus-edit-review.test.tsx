import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import {
	FIRST_POSTED_REQUEST_INDEX,
	OPENED_AT,
	serving,
} from "./corpus-edit-test-fixtures";
import { edited, reviewed } from "./corpus-editor-test-driver";
import CorpusPage from "./corpus-page";
import { originalFetch } from "./corpus-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(CorpusPage.name, () => {
	describe("when editing a file of a linked directory", () => {
		it(
			"shows a line diff of the change against the file's bytes",
			showsALineDiffOfTheChangeAgainstTheFileSBytes,
		);

		it(
			"names the starting version and how many recorded results it would mark stale before applying",
			namesTheStartingVersionAndHowManyRecordedResultsItWouldMarkStaleBeforeApplying,
		);

		it(
			"says Apply waits for the launches it started, never for a replay started from a terminal",
			saysApplyWaitsForTheLaunchesItStartedNeverForAReplayStartedFromATerminal,
		);

		it(
			"asks for a new review once the text changes after one",
			asksForANewReviewOnceTheTextChangesAfterOne,
		);

		it(
			"closes the edit on Discard and writes nothing",
			closesTheEditOnDiscardAndWritesNothing,
		);
	});
});

async function showsALineDiffOfTheChangeAgainstTheFileSBytes(): Promise<void> {
	serving();

	await edited();

	const diff = await screen.findByRole("list", {
		name: "Changes to CLAUDE.md",
	});
	expect(
		within(diff)
			.getAllByRole("listitem")
			.map((line) => line.textContent),
	).toEqual(["1− instructions", "1+ instructions, edited", "2  keep"]);
}

async function namesTheStartingVersionAndHowManyRecordedResultsItWouldMarkStaleBeforeApplying(): Promise<void> {
	const server = serving();

	await reviewed();

	expect(screen.getByText(/^Starts from/u)).toHaveTextContent(
		"Starts from corpus@a41c7e",
	);
	expect(
		screen.getByText("Marks 3 recorded results stale, none deleted"),
	).toBeInTheDocument();
	expect(
		JSON.parse(
			server.posted("/api/corpus/edits/review")[FIRST_POSTED_REQUEST_INDEX]
				?.body ?? "",
		),
	).toEqual({
		path: "CLAUDE.md",
		startsFrom: OPENED_AT,
		text: "instructions, edited\nkeep\n",
	});
	expect(server.posted("/api/corpus/edits/apply")).toEqual([]);
}

async function saysApplyWaitsForTheLaunchesItStartedNeverForAReplayStartedFromATerminal(): Promise<void> {
	serving();

	await reviewed();

	expect(
		screen.getByText(
			"Apply refuses while a launch this server started runs. A replay started from a terminal is not seen, so an apply during one records a version its session did not read.",
		),
	).toBeInTheDocument();
}

async function asksForANewReviewOnceTheTextChangesAfterOne(): Promise<void> {
	serving();
	await reviewed();

	fireEvent.change(screen.getByRole("textbox", { name: "Text of CLAUDE.md" }), {
		target: { value: "instructions, again\nkeep\n" },
	});

	expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
	expect(screen.getByRole("button", { name: "Review" })).toBeInTheDocument();
}

async function closesTheEditOnDiscardAndWritesNothing(): Promise<void> {
	const server = serving();
	await reviewed();

	fireEvent.click(screen.getByRole("button", { name: "Discard" }));

	expect(
		screen.queryByRole("textbox", { name: "Text of CLAUDE.md" }),
	).toBeNull();
	expect(server.posted("/api/corpus/edits/apply")).toEqual([]);
}
