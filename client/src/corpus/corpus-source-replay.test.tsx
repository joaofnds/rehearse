import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";

import {
	FIRST_POSTED_REQUEST_INDEX,
	RUN,
	applied,
} from "./corpus-edit-test-fixtures";
import { applySourceEdit } from "./corpus-editor-test-driver";
import CorpusPage from "./corpus-page";
import { servingSource } from "./corpus-source-test-fixtures";
import { corpusResponseBody, originalFetch } from "./corpus-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(CorpusPage.name, () => {
	describe("when editing a file of a linked directory", () => {
		describe("when a recorded step is the source", () => {
			it(
				"keeps a source-read error explicit after apply",
				keepsASourceReadErrorExplicitAfterApply,
			);

			it(
				"keeps the saved source and current corpus distinct through review and apply",
				keepsTheSavedSourceAndCurrentCorpusDistinctThroughReviewAndApply,
			);

			it(
				"offers three attempts from the selected step even when apply suggests another run",
				offersThreeAttemptsFromTheSelectedStepEvenWhenApplySuggestsAnotherRun,
			);

			it(
				"clears the source when editing a different corpus file",
				clearsTheSourceWhenEditingADifferentCorpusFile,
			);
		});
	});
});

async function keepsASourceReadErrorExplicitAfterApply(): Promise<void> {
	const expectedMatchingElementsCount = 2;

	servingSource(
		new Map([
			[
				`GET /api/runs/${RUN}`,
				{ body: { error: "source unavailable" }, status: 404 },
			],
		]),
	);
	await applySourceEdit();
	expect(screen.getAllByText(/Could not read the saved run/u)).toHaveLength(
		expectedMatchingElementsCount,
	);
	expect(
		screen.queryByText(/Saved source evidence is loading/u),
	).not.toBeInTheDocument();
}

async function keepsTheSavedSourceAndCurrentCorpusDistinctThroughReviewAndApply(): Promise<void> {
	servingSource();

	const context = await screen.findByRole("region", {
		name: "Instruction test source",
	});
	expect(context).toHaveTextContent("corpus@c63e9a");
	expect(context).toHaveTextContent("plan checkpoint");
	expect(context).toHaveTextContent("current linked corpus@a41c7e");
	await applySourceEdit();

	expect(context).toHaveTextContent("corpus@c63e9a");
	expect(context).toHaveTextContent("current linked corpus@a41c7e");
	expect(
		within(context).getByRole("link", {
			name: "Return to source results",
		}),
	).toHaveAttribute("href", `/runs/${RUN}?view=results&step=discuss`);
}

async function offersThreeAttemptsFromTheSelectedStepEvenWhenApplySuggestsAnotherRun(): Promise<void> {
	const server = servingSource(
		new Map([
			[
				"POST /api/corpus/edits/apply",
				applied({
					rerun: {
						kind: "offered",
						run: "unrelated-run",
						stage: "build",
					},
				}),
			],
			["GET /api/cases", { body: { cases: [], unreadable: [] }, status: 200 }],
			["POST /api/launches", { body: { id: "launch-1" }, status: 202 }],
		]),
	);

	await applySourceEdit();
	fireEvent.click(
		screen.getByRole("button", { name: "Replay discuss · 3 attempts" }),
	);
	const start = await screen.findByRole("button", { name: /^Start · /u });
	await waitFor(() => {
		expect(start).toBeEnabled();
	});
	fireEvent.click(start);

	await waitFor(() => {
		const expectedPostedCount = 1;

		expect(server.posted("/api/launches")).toHaveLength(expectedPostedCount);
	});
	expect(
		JSON.parse(
			server.posted("/api/launches")[FIRST_POSTED_REQUEST_INDEX]?.body ?? "",
		),
	).toEqual({
		attempts: 3,
		kind: "replay",
		run: RUN,
		stage: "discuss",
	});
}

async function clearsTheSourceWhenEditingADifferentCorpusFile(): Promise<void> {
	servingSource(
		new Map([
			[
				"GET /api/corpus",
				{
					body: {
						...corpusResponseBody(),
						files: [
							...corpusResponseBody().files,
							{
								invalidated: 0,
								lastEditedAt: "2026-09-04T09:41:00.000Z",
								lines: 1,
								path: "skills/other/SKILL.md",
								readBy: 0,
								sha256: "1".repeat(SHA256_HEX_CHARACTERS),
							},
						],
					},
					status: 200,
				},
			],
		]),
	);
	await screen.findByRole("region", { name: "Instruction test source" });

	fireEvent.click(
		screen.getByRole("button", { name: "Edit skills/other/SKILL.md" }),
	);

	expect(
		screen.queryByRole("region", { name: "Instruction test source" }),
	).toBeNull();
	expect(
		await screen.findByRole("textbox", {
			name: "Text of skills/other/SKILL.md",
		}),
	).toBeInTheDocument();
}
