import { afterEach, describe, expect, it } from "bun:test";

import { screen, waitFor, within } from "@testing-library/react";

import LiveReply from "#client/test-support/live-reply";

import {
	FIRST_POSTED_REQUEST_INDEX,
	STARTS_FROM,
	applied,
	serving,
} from "./corpus-edit-test-fixtures";
import { appliedEdit } from "./corpus-editor-test-driver";
import CorpusPage from "./corpus-page";
import { APPLIED_CORPUS } from "./corpus-report-test-fixtures";
import { corpusResponseBody, originalFetch } from "./corpus-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(CorpusPage.name, () => {
	describe("when editing a file of a linked directory", () => {
		it(
			"applies the reviewed text from the reviewed version and shows the new version",
			appliesTheReviewedTextFromTheReviewedVersionAndShowsTheNewVersion,
		);

		it(
			"shows the applied edit's invalidated results on the card and in the file's row without a reload",
			showsTheAppliedEditSInvalidatedResultsOnTheCardAndInTheFileSRowWithoutAReload,
		);

		it(
			"asks a direct corpus edit to choose its source in Runs",
			asksADirectCorpusEditToChooseItsSourceInRuns,
		);

		it(
			"says why it offers no replay when none can settle the edit",
			saysWhyItOffersNoReplayWhenNoneCanSettleTheEdit,
		);

		it.each(
			(
				[
					{ needed: true, shown: 1 },
					{ needed: false, shown: 0 },
				] as const
			).map(({ needed, shown }) => [needed, shown] as const),
		)(
			"says a browser comparison will need a comparison manifest only when the server says so (%p)",
			async (needed, shown) => {
				serving(
					new Map([
						[
							"POST /api/corpus/edits/apply",
							applied({ needsComparisonManifest: needed }),
						],
					]),
				);

				await appliedEdit();

				expect(screen.queryAllByText(/comparison manifest/u)).toHaveLength(
					shown,
				);
			},
		);
	});
});

async function appliesTheReviewedTextFromTheReviewedVersionAndShowsTheNewVersion(): Promise<void> {
	const server = serving();

	await appliedEdit();
	const confirmation = screen.getByText(/^Applied CLAUDE\.md:/u);
	await waitFor(() => {
		expect(document.activeElement === confirmation).toBe(true);
	});

	expect(
		JSON.parse(
			server.posted("/api/corpus/edits/apply")[FIRST_POSTED_REQUEST_INDEX]
				?.body ?? "",
		),
	).toEqual({
		path: "CLAUDE.md",
		startsFrom: STARTS_FROM,
		text: "instructions, edited\nkeep\n",
	});
	expect(screen.getByText("corpus@b52d8f")).toBeInTheDocument();
	expect(
		screen.getByText("Marked 3 recorded results stale, none deleted"),
	).toBeInTheDocument();
}

async function showsTheAppliedEditSInvalidatedResultsOnTheCardAndInTheFileSRowWithoutAReload(): Promise<void> {
	let appliedYet = false;

	serving(
		new Map([
			[
				"GET /api/corpus",
				new LiveReply(() => ({
					body: appliedYet ? APPLIED_CORPUS : corpusResponseBody(),
					status: 200,
				})),
			],
			[
				"POST /api/corpus/edits/apply",
				new LiveReply(() => {
					appliedYet = true;

					return applied();
				}),
			],
		]),
	);

	await appliedEdit();

	const card = screen.getByRole("region", {
		name: "Invalidated by the last edit",
	});
	await waitFor(() => {
		expect(card).toHaveTextContent("3 recorded results · review them");
	});
	const row = screen.getByText("CLAUDE.md").closest("tr");
	expect(row).not.toBeNull();
	expect(
		within(row ?? document.body)
			.getAllByRole("cell")
			.map(({ textContent }) => textContent),
	).toContain("⚠ 3 results");
}

async function asksADirectCorpusEditToChooseItsSourceInRuns(): Promise<void> {
	const server = serving();

	await appliedEdit();

	expect(
		screen.getByRole("link", { name: "Choose a source step in Runs" }),
	).toHaveAttribute("href", "/");
	expect(screen.queryByRole("button", { name: /Replay discuss/u })).toBeNull();
	expect(server.posted("/api/launches")).toEqual([]);
}

async function saysWhyItOffersNoReplayWhenNoneCanSettleTheEdit(): Promise<void> {
	serving(
		new Map([
			[
				"POST /api/corpus/edits/apply",
				applied({
					rerun: { kind: "none", reason: "No result read CLAUDE.md" },
				}),
			],
		]),
	);

	await appliedEdit();

	expect(screen.getByText("No result read CLAUDE.md")).toBeInTheDocument();
	expect(screen.queryByRole("button", { name: /Replay/u })).toBeNull();
}
