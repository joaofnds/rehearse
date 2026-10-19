import { afterEach, describe, expect, it } from "bun:test";

import {
	act,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";

import type { Reply } from "#client/test-support/fetch-stub";
import { FakeServer } from "#client/test-support/fetch-stub";
import LiveReply from "#client/test-support/live-reply";
import {
	SHELL_BASELINE,
	renderAppAt,
	settingsReading,
} from "#client/test-support/render-app";
import CORPUS_VERSION_HEADER from "#server/corpus-version-header";

import { DRAFT_CORPUS } from "./corpus-test-fixtures";

const expectedPostedCount = 0;

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});

interface CorpusHarness {
	readonly router: ReturnType<typeof renderAppAt>;
	readonly server: FakeServer;
	readonly updateFile: () => void;
}

function openCorpus(
	path = "/corpus?file=CLAUDE.md",
	live = false,
): CorpusHarness {
	const savedCeilingUsd = 5;

	const settings = settingsReading(savedCeilingUsd);
	let currentText = "saved text\n";
	let currentVersion = "baseline";
	const replies = new Map<string, Reply | LiveReply>([
		...[...SHELL_BASELINE].map(([apiPath, body]): [string, Reply] => [
			`GET ${apiPath}`,
			{ body, status: 200 },
		]),
		[
			"GET /api/settings",
			{
				body: {
					...settings,
					linkedCorpus: { kind: live ? "live" : "directory", root: "/copy" },
				},
				status: 200,
			},
		],
		["GET /api/corpus", { body: DRAFT_CORPUS, status: 200 }],
		[
			"GET /api/corpus/file",
			new LiveReply(() => ({
				body: new TextEncoder().encode(currentText),
				headers: { [CORPUS_VERSION_HEADER]: currentVersion },
				status: 200,
			})),
		],
	]);
	const server = new FakeServer(replies);
	server.install();
	const router = renderAppAt(path);
	return {
		router,
		server,
		updateFile: () => {
			currentText = "new saved text\n";
			currentVersion = "changed";
		},
	};
}

async function recoversAFileSDraftAfterNavigationAndExplicitlyDiscardsIt(): Promise<void> {
	const { router, server } = openCorpus();
	fireEvent.change(
		await screen.findByRole("textbox", { name: "Text of CLAUDE.md" }),
		{ target: { value: "my unapplied draft\n" } },
	);
	await act(async () => {
		await router.navigate({ to: "/" });
	});
	await act(async () => {
		await router.navigate({ search: { file: "CLAUDE.md" }, to: "/corpus" });
	});
	expect(
		await screen.findByRole("textbox", { name: "Text of CLAUDE.md" }),
	).toHaveValue("my unapplied draft\n");
	expect(
		await screen.findByText(/Recovered an unapplied draft/u),
	).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Discard" }));
	fireEvent.click(screen.getByRole("button", { name: "Edit CLAUDE.md" }));
	expect(
		await screen.findByRole("textbox", { name: "Text of CLAUDE.md" }),
	).toHaveValue("saved text\n");
	expect(server.posted("/api/corpus/edits/apply")).toHaveLength(
		expectedPostedCount,
	);
}
async function filtersFilesAfterDiscardingDraft(): Promise<void> {
	const { router } = openCorpus();
	fireEvent.change(
		await screen.findByRole("textbox", { name: "Text of CLAUDE.md" }),
		{ target: { value: "my unapplied draft\n" } },
	);
	await act(async () => {
		await router.navigate({ to: "/" });
	});
	await act(async () => {
		await router.navigate({ search: { file: "CLAUDE.md" }, to: "/corpus" });
	});
	fireEvent.click(screen.getByRole("button", { name: "Discard" }));
	fireEvent.click(screen.getByRole("button", { name: "Edit CLAUDE.md" }));
	fireEvent.change(
		screen.getByRole("searchbox", { name: "Search corpus files" }),
		{ target: { value: "skills/build" } },
	);
	await waitFor(() => {
		const expectedRowCount = 2;

		expect(
			within(screen.getByRole("table", { name: "Corpus files" })).getAllByRole(
				"row",
			),
		).toHaveLength(expectedRowCount);
	});
	expect(
		within(screen.getByRole("table", { name: "Corpus files" })).getByText(
			"skills/build.md",
		),
	).toBeInTheDocument();
}

async function rereadsTheCurrentBaselineWhileKeepingRecoveredTextSeparateForEachSource(): Promise<void> {
	const { router, updateFile } = openCorpus();
	fireEvent.change(
		await screen.findByRole("textbox", { name: "Text of CLAUDE.md" }),
		{ target: { value: "my original draft\n" } },
	);
	await act(async () => {
		await router.navigate({ to: "/" });
	});
	updateFile();
	await act(async () => {
		await router.navigate({ search: { file: "CLAUDE.md" }, to: "/corpus" });
	});
	expect(
		await screen.findByRole("textbox", { name: "Text of CLAUDE.md" }),
	).toHaveValue("my original draft\n");
	expect(
		screen.getByText(/The corpus changed since this draft began/u),
	).toBeInTheDocument();
	expect(
		within(
			screen.getByRole("list", { name: "Changes to CLAUDE.md" }),
		).getByText(/new saved text/u),
	).toBeInTheDocument();
	await act(async () => {
		await router.navigate({
			search: {
				file: "CLAUDE.md",
				sourceRun: "other-source",
				sourceStep: "build",
			},
			to: "/corpus",
		});
	});
	expect(
		await screen.findByRole("textbox", { name: "Text of CLAUDE.md" }),
	).toHaveValue("new saved text\n");
}

async function opensTheEditableCopySettingsPathAndReturnsWithItsSavedSource(): Promise<void> {
	openCorpus(
		"/corpus?file=CLAUDE.md&sourceRun=source-run&sourceStep=build&start=2&end=4",
		true,
	);
	const viewer = await screen.findByRole("region", {
		name: "Instruction text · CLAUDE.md",
	});
	fireEvent.click(
		await screen.findByRole("button", { name: "View CLAUDE.md" }),
	);
	expect(viewer).toHaveTextContent("Linked lines 2–4");
	expect(await within(viewer).findByText("saved text")).toBeInTheDocument();
}
async function retainsInstructionSourceAcrossSettingsReturn(): Promise<void> {
	const { router, server } = openCorpus(
		"/corpus?file=CLAUDE.md&sourceRun=source-run&sourceStep=build&start=2&end=4",
		true,
	);
	fireEvent.click(
		await screen.findByRole("button", { name: "View CLAUDE.md" }),
	);
	fireEvent.click(
		await screen.findByRole("link", {
			name: "Link an editable copy in Settings",
		}),
	);
	fireEvent.click(
		await screen.findByRole("link", { name: "Return to instruction edit" }),
	);
	await waitFor(() => {
		expect(router.state.location.search).toMatchObject({
			end: 4,
			file: "CLAUDE.md",
			sourceRun: "source-run",
			sourceStep: "build",
			start: 2,
		});
	});
	expect(
		await screen.findByRole("region", { name: "Instruction test source" }),
	).toBeInTheDocument();
	await act(async () => {
		await router.navigate({ to: "/settings" });
	});
	expect(
		await screen.findByRole("heading", { level: 1, name: "Settings" }),
	).toBeInTheDocument();
	expect(
		screen.queryByRole("link", { name: "Return to instruction edit" }),
	).not.toBeInTheDocument();
	expect(server.posted("/api/corpus/edits/apply")).toHaveLength(
		expectedPostedCount,
	);
}

describe("recovering instruction drafts", () => {
	it(
		"filters the file inventory after discarding a recovered draft",
		filtersFilesAfterDiscardingDraft,
	);
	it(
		"recovers a file’s draft after navigation and explicitly discards it",
		recoversAFileSDraftAfterNavigationAndExplicitlyDiscardsIt,
	);
	it(
		"rereads the current baseline while keeping recovered text separate for each source",
		rereadsTheCurrentBaselineWhileKeepingRecoveredTextSeparateForEachSource,
	);
	it(
		"retains the source through Settings and clears its return link after leaving",
		retainsInstructionSourceAcrossSettingsReturn,
	);
	it(
		"opens the editable-copy settings path and returns with its saved source",
		opensTheEditableCopySettingsPathAndReturnsWithItsSavedSource,
	);
});
