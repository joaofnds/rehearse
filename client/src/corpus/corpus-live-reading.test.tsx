import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import type { FakeServer, Reply } from "#client/test-support/fetch-stub";
import CORPUS_VERSION_HEADER from "#server/corpus-version-header";

import {
	INVALID_UTF8_INVALID_LEAD_BYTE,
	LINK_COMMAND,
	OPENED_AT,
	opened,
	serving,
	settingsReading,
} from "./corpus-edit-test-fixtures";
import CorpusPage from "./corpus-page";
import { originalFetch } from "./corpus-test-fixtures";

const expectedPostedCount = 0;

interface LiveReadRefusal {
	readonly name: string;
	readonly reply: Reply;
	readonly reason: string;
}

const LIVE_READ_REFUSALS: readonly LiveReadRefusal[] = [
	{
		name: "invalid UTF-8",
		reason: "is not UTF-8 text",
		reply: {
			body: Uint8Array.of(INVALID_UTF8_INVALID_LEAD_BYTE),
			headers: { [CORPUS_VERSION_HEADER]: OPENED_AT },
			status: 200,
		},
	},
	{
		name: "missing version",
		reason: "without the corpus version",
		reply: { body: new TextEncoder().encode("instruction"), status: 200 },
	},
	{
		name: "unlisted path",
		reason: "lists no file CLAUDE.md",
		reply: {
			body: { error: "The corpus report lists no file CLAUDE.md" },
			status: 404,
		},
	},
];

let liveServer: FakeServer | null = null;

const liveText = "# Instruction\r\nkeep this line\r\n";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(CorpusPage.name, () => {
	describe("when editing a file of a linked directory", () => {
		describe("when the live install is linked", () => {
			describe("while a live file is open", () => {
				beforeEach(opensLiveReader);
				it("renders its instruction", rendersLiveInstruction);
				it(
					"preserves its raw bytes and recorded version",
					preservesLiveRawBytes,
				);
				it(
					"offers reading without editor or write requests",
					leavesLiveReadsWithoutWrites,
				);
			});

			it.each([...LIVE_READ_REFUSALS])(
				"keeps $name explicit in the read-only viewer",
				readsLiveRefusal,
			);

			it(
				"offers no Edit and names the command that links a copy",
				offersNoEditAndNamesTheCommandThatLinksACopy,
			);
		});
	});
});

async function offersNoEditAndNamesTheCommandThatLinksACopy(): Promise<void> {
	serving(
		new Map([
			["GET /api/settings", { body: settingsReading("live"), status: 200 }],
		]),
	);

	expect(await screen.findByText(LINK_COMMAND)).toBeInTheDocument();
	expect(screen.queryByRole("button", { name: /^Edit/u })).toBeNull();
}

async function readsLiveRefusal({
	reply,
	reason,
}: LiveReadRefusal): Promise<void> {
	const server = serving(
		new Map<string, Reply>([
			["GET /api/settings", { body: settingsReading("live"), status: 200 }],
			["GET /api/corpus/file", reply],
		]),
		{ linked: { path: "CLAUDE.md" } },
	);

	const refusal = await screen.findByRole("alert");

	expect(refusal).toHaveTextContent(reason);
	expect(screen.queryByRole("button", { name: "Raw" })).not.toBeInTheDocument();
	expect(server.posted("/api/corpus/edits/apply")).toHaveLength(
		expectedPostedCount,
	);
}

async function opensLiveReader(): Promise<void> {
	const fetchReplies = new Map([
		["GET /api/settings", { body: settingsReading("live"), status: 200 }],
		["GET /api/corpus/file", opened(new TextEncoder().encode(liveText))],
	]);
	liveServer = serving(fetchReplies);
	fireEvent.click(
		await screen.findByRole("button", { name: "View CLAUDE.md" }),
	);
	await screen.findByRole("region", {
		name: "Instruction text · CLAUDE.md",
	});
}

async function rendersLiveInstruction(): Promise<void> {
	const viewer = await screen.findByRole("region", {
		name: "Instruction text · CLAUDE.md",
	});
	expect(
		await within(viewer).findByRole("heading", { name: "Instruction" }),
	).toBeInTheDocument();
}

async function preservesLiveRawBytes(): Promise<void> {
	const viewer = await screen.findByRole("region", {
		name: "Instruction text · CLAUDE.md",
	});
	fireEvent.click(within(viewer).getByRole("button", { name: "Raw" }));
	expect(viewer.querySelector("pre")?.textContent).toBe(liveText);
	expect(within(viewer).getByText("corpus@c63e9a")).toBeInTheDocument();
}

async function leavesLiveReadsWithoutWrites(): Promise<void> {
	if (liveServer === null) {
		throw new Error("live reader setup did not run");
	}
	const viewer = await screen.findByRole("region", {
		name: "Instruction text · CLAUDE.md",
	});
	fireEvent.click(within(viewer).getByRole("button", { name: "Raw" }));
	expect(
		screen.queryByRole("textbox", { name: "Text of CLAUDE.md" }),
	).not.toBeInTheDocument();
	expect(
		screen.queryByRole("button", { name: /^(?:Edit|Review|Apply)/u }),
	).not.toBeInTheDocument();
	expect(liveServer.posted("/api/corpus/edits/review")).toHaveLength(
		expectedPostedCount,
	);
	expect(liveServer.posted("/api/corpus/edits/apply")).toHaveLength(
		expectedPostedCount,
	);
	expect(
		liveServer.sent.find(({ pathname }) => pathname === "/api/corpus/file")
			?.search,
	).toBe("?path=CLAUDE.md");
}
