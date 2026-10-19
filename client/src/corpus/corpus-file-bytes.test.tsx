import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor } from "@testing-library/react";

import {
	INVALID_UTF8_INVALID_LEAD_BYTE,
	INVALID_UTF8_LINE_FEED,
	INVALID_UTF8_LOWERCASE_I,
	OVERSIZE_FILE,
	opened,
	serving,
} from "./corpus-edit-test-fixtures";
import { openInstructionEditor } from "./corpus-editor-test-driver";
import CorpusPage from "./corpus-page";
import { originalFetch } from "./corpus-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(CorpusPage.name, () => {
	describe("when editing a file of a linked directory", () => {
		it(
			"keeps a byte order mark, so an apply writes it back",
			keepsAByteOrderMarkSoAnApplyWritesItBack,
		);

		it(
			"refuses to open a file with carriage returns, since the text box would drop them",
			refusesToOpenAFileWithCarriageReturnsSinceTheTextBoxWouldDropThem,
		);

		it(
			"says a file holding too many lines cannot be diffed here",
			saysAFileHoldingTooManyLinesCannotBeDiffedHere,
		);

		it(
			"refuses to open a file whose bytes are not UTF-8 text, since saving it would rewrite them",
			refusesToOpenAFileWhoseBytesAreNotUTF8TextSinceSavingItWouldRewriteThem,
		);
	});
});

async function keepsAByteOrderMarkSoAnApplyWritesItBack(): Promise<void> {
	const fetchReplies = new Map([
		[
			"GET /api/corpus/file",
			// TextEncoder writes U+FEFF as the three bytes of a UTF-8 mark.
			opened(new TextEncoder().encode("\uFEFFa\n")),
		],
	]);
	serving(fetchReplies);

	const textbox = await openInstructionEditor();

	await waitFor(() => {
		expect(textbox).toHaveValue("\uFEFFa\n");
	});
}

async function refusesToOpenAFileWithCarriageReturnsSinceTheTextBoxWouldDropThem(): Promise<void> {
	const fetchReplies = new Map([
		["GET /api/corpus/file", opened(new TextEncoder().encode("a\r\nb\r\n"))],
	]);
	serving(fetchReplies);

	fireEvent.click(
		await screen.findByRole("button", { name: "Edit CLAUDE.md" }),
	);

	expect(await screen.findByRole("alert")).toHaveTextContent(
		"Could not read CLAUDE.md: CLAUDE.md has carriage returns",
	);
}

async function saysAFileHoldingTooManyLinesCannotBeDiffedHere(): Promise<void> {
	const sourceLines = OVERSIZE_FILE.line.repeat(OVERSIZE_FILE.lineCount);
	const fetchReplies = new Map([
		["GET /api/corpus/file", opened(new TextEncoder().encode(sourceLines))],
	]);
	serving(fetchReplies);

	await openInstructionEditor();

	expect(
		await screen.findByText("CLAUDE.md holds too many lines to diff here."),
	).toBeInTheDocument();
}

async function refusesToOpenAFileWhoseBytesAreNotUTF8TextSinceSavingItWouldRewriteThem(): Promise<void> {
	const fetchReplies = new Map([
		[
			"GET /api/corpus/file",
			// "i", a byte no UTF-8 sequence holds, and a newline.
			opened(
				Uint8Array.of(
					INVALID_UTF8_LOWERCASE_I,
					INVALID_UTF8_INVALID_LEAD_BYTE,
					INVALID_UTF8_LINE_FEED,
				),
			),
		],
	]);
	serving(fetchReplies);

	fireEvent.click(
		await screen.findByRole("button", { name: "Edit CLAUDE.md" }),
	);

	expect(await screen.findByRole("alert")).toHaveTextContent(
		/Could not read CLAUDE\.md/u,
	);
	expect(
		screen.queryByRole("textbox", { name: "Text of CLAUDE.md" }),
	).toBeNull();
}
