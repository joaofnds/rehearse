import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor } from "@testing-library/react";

import { STARTS_FROM, serving } from "./corpus-edit-test-fixtures";
import { edited, reviewed } from "./corpus-editor-test-driver";
import CorpusPage from "./corpus-page";
import { originalFetch } from "./corpus-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(CorpusPage.name, () => {
	describe("when editing a file of a linked directory", () => {
		it(
			"shows a refused apply's reason and keeps the edit open",
			showsARefusedApplySReasonAndKeepsTheEditOpen,
		);

		it(
			"reads the file again after a refused review, keeping the edit",
			readsTheFileAgainAfterARefusedReviewKeepingTheEdit,
		);

		it(
			"shows a review's apply refusal and offers no Apply",
			showsAReviewSApplyRefusalAndOffersNoApply,
		);
	});
});

async function showsARefusedApplySReasonAndKeepsTheEditOpen(): Promise<void> {
	serving(
		new Map([
			[
				"POST /api/corpus/edits/apply",
				{
					body: { error: "The edit leaves CLAUDE.md unchanged" },
					status: 409,
				},
			],
		]),
	);
	await reviewed();

	fireEvent.click(screen.getByRole("button", { name: "Apply" }));

	expect(
		await screen.findByText("The edit leaves CLAUDE.md unchanged"),
	).toBeInTheDocument();
	expect(
		screen.getByRole("textbox", { name: "Text of CLAUDE.md" }),
	).toHaveValue("instructions, edited\nkeep\n");
	expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
	expect(screen.getByRole("button", { name: "Review" })).toBeInTheDocument();
}

async function readsTheFileAgainAfterARefusedReviewKeepingTheEdit(): Promise<void> {
	const server = serving(
		new Map([
			[
				"POST /api/corpus/edits/review",
				{
					body: {
						error: "The linked directory changed after CLAUDE.md was opened",
					},
					status: 409,
				},
			],
		]),
	);
	await edited();

	fireEvent.click(screen.getByRole("button", { name: "Review" }));

	expect(
		await screen.findByText(
			"The linked directory changed after CLAUDE.md was opened",
		),
	).toBeInTheDocument();
	await waitFor(() => {
		const expectedSentCount = 2;

		expect(
			server.sent.filter(({ pathname }) => pathname === "/api/corpus/file"),
		).toHaveLength(expectedSentCount);
	});
	expect(
		screen.getByRole("textbox", { name: "Text of CLAUDE.md" }),
	).toHaveValue("instructions, edited\nkeep\n");
}

async function showsAReviewSApplyRefusalAndOffersNoApply(): Promise<void> {
	serving(
		new Map([
			[
				"POST /api/corpus/edits/review",
				{
					body: {
						applyRefusal:
							"The linked corpus directory resolves into the live install",
						invalidated: 3,
						startsFrom: STARTS_FROM,
					},
					status: 200,
				},
			],
		]),
	);

	await reviewed();

	expect(
		screen.getByText(
			"The linked corpus directory resolves into the live install",
		),
	).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
}
