import { afterEach, describe, expect, it } from "bun:test";

import { QueryClient } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { z } from "zod";

import LiveReply from "#client/test-support/live-reply";
import CORPUS_VERSION_HEADER from "#server/corpus-version-header";

import {
	NEW_VERSION,
	opened,
	serving,
	settingsReading,
} from "./corpus-edit-test-fixtures";
import { openInstructionEditor } from "./corpus-editor-test-driver";
import CorpusPage from "./corpus-page";
import { corpusWithLinkedSkill, originalFetch } from "./corpus-test-fixtures";

const client = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(CorpusPage.name, () => {
	describe("when editing a file of a linked directory", () => {
		it(
			"opens the file's text as the corpus under test holds it",
			opensTheFileSTextAsTheCorpusUnderTestHoldsIt,
		);

		it(
			"opens the file a link names with the lines it names selected",
			opensTheFileALinkNamesWithTheLinesItNamesSelected,
		);

		it(
			"opens a directory file for reading before offering its editor",
			opensADirectoryFileForReadingBeforeOfferingItsEditor,
		);

		it.each(["live", "directory"] as const)(
			"focuses the %s reader and returns to the exact file action on close",
			focusesAndClosesFileReader,
		);

		it(
			"keeps the reader from taking focus again when its file refetches",
			keepsTheReaderFromTakingFocusAgainWhenItsFileRefetches,
		);

		it(
			"moves focus to the selected file’s text",
			movesFocusToTheSelectedFileSText,
		);
	});
});

async function opensTheFileSTextAsTheCorpusUnderTestHoldsIt(): Promise<void> {
	const server = serving();

	const textbox = await openInstructionEditor();

	await waitFor(() => {
		expect(textbox).toHaveValue("instructions\nkeep\n");
	});
	expect(
		server.sent.find(({ pathname }) => pathname === "/api/corpus/file")?.search,
	).toBe("?path=CLAUDE.md");
}

async function opensTheFileALinkNamesWithTheLinesItNamesSelected(): Promise<void> {
	serving(new Map(), {
		linked: { lines: { end: 2, start: 2 }, path: "CLAUDE.md" },
	});

	const textbox = await screen.findByRole("textbox", {
		name: "Text of CLAUDE.md",
	});

	await waitFor(() => {
		expect(textbox).toHaveFocus();
	});
	const field = z.instanceof(HTMLTextAreaElement).parse(textbox);
	expect(field.value.slice(field.selectionStart, field.selectionEnd)).toBe(
		"keep\n",
	);
}

async function opensADirectoryFileForReadingBeforeOfferingItsEditor(): Promise<void> {
	const expectedPostedCount = 0;

	const server = serving();

	fireEvent.click(
		await screen.findByRole("button", { name: "View CLAUDE.md" }),
	);

	const viewer = await screen.findByRole("region", {
		name: "Instruction text · CLAUDE.md",
	});
	expect(await within(viewer).findByText(/instructions/u)).toBeInTheDocument();
	expect(
		screen.queryByRole("textbox", { name: "Text of CLAUDE.md" }),
	).not.toBeInTheDocument();
	fireEvent.click(
		within(viewer).getByRole("button", { name: "Edit this file" }),
	);
	expect(
		await screen.findByRole("textbox", { name: "Text of CLAUDE.md" }),
	).toHaveValue("instructions\nkeep\n");
	expect(server.posted("/api/corpus/edits/apply")).toHaveLength(
		expectedPostedCount,
	);
}

async function keepsTheReaderFromTakingFocusAgainWhenItsFileRefetches(): Promise<void> {
	let reading = opened(new TextEncoder().encode("instructions\nkeep\n"));
	serving(new Map([["GET /api/corpus/file", new LiveReply(() => reading)]]), {
		client,
		linked: undefined,
		source: undefined,
	});
	fireEvent.click(
		await screen.findByRole("button", { name: "View CLAUDE.md" }),
	);
	const viewer = await screen.findByRole("region", {
		name: "Instruction text · CLAUDE.md",
	});
	await within(viewer).findByText(/instructions/u);
	screen.getByRole("searchbox", { name: "Search corpus files" }).focus();
	reading = {
		...opened(new TextEncoder().encode("updated instructions\nkeep\n")),
		headers: { [CORPUS_VERSION_HEADER]: NEW_VERSION },
	};

	await client.invalidateQueries({ queryKey: ["corpus-file-reading"] });
	await within(viewer).findByText(/updated instructions/u);

	expect(
		document.activeElement ===
			screen.getByRole("searchbox", { name: "Search corpus files" }),
	).toBe(true);
}

async function movesFocusToTheSelectedFileSText(): Promise<void> {
	serving();

	const textbox = await openInstructionEditor();

	await waitFor(() => {
		expect(textbox).toHaveFocus();
	});
}

async function focusesAndClosesFileReader(
	kind: "live" | "directory",
): Promise<void> {
	serving(
		new Map([
			["GET /api/settings", { body: settingsReading(kind), status: 200 }],
			[
				"GET /api/corpus",
				{
					body: corpusWithLinkedSkill(),
					status: 200,
				},
			],
		]),
	);
	const origin = await screen.findByRole("button", {
		name: "View skills/build/SKILL.md",
	});

	origin.focus();
	fireEvent.click(origin);

	const heading = await screen.findByRole("heading", {
		name: "skills/build/SKILL.md",
	});
	await waitFor(() => {
		expect(document.activeElement === heading).toBe(true);
	});
	fireEvent.click(screen.getByRole("button", { name: "Close file" }));
	await waitFor(() => {
		expect(document.activeElement === origin).toBe(true);
	});
	expect(
		screen.queryByRole("region", {
			name: "Instruction text · skills/build/SKILL.md",
		}),
	).toBeNull();
}
