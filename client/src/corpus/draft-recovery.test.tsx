import { afterEach, expect, it } from "bun:test";
import {
	act,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { LiveReply } from "#client/test-support/live-reply";
import type { Reply } from "#client/test-support/fetch-stub";
import { FakeServer } from "#client/test-support/fetch-stub";
import {
	renderAppAt,
	SHELL_BASELINE,
	settingsReading,
} from "#client/test-support/render-app";
import { CORPUS_VERSION_HEADER } from "#server/corpus-version-header";

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
	const settings = settingsReading(5);
	const corpus = {
		root: "/copy",
		digest: "baseline",
		files: [
			{
				path: "CLAUDE.md",
				sha256: "123",
				lastEditedAt: new Date(0).toISOString(),
				lines: 1,
				readBy: 0,
				invalidated: 0,
			},
			{
				path: "skills/build.md",
				sha256: "456",
				lastEditedAt: new Date(0).toISOString(),
				lines: 1,
				readBy: 0,
				invalidated: 0,
			},
		],
		refusals: [],
		lastEdit: { kind: "not-recorded", reason: "none" },
	};
	let currentText = "saved text\n";
	let currentVersion = "baseline";
	const replies = new Map<string, Reply | LiveReply>([
		...[...SHELL_BASELINE].map(([apiPath, body]): [string, Reply] => [
			`GET ${apiPath}`,
			{ status: 200, body },
		]),
		[
			"GET /api/settings",
			{
				status: 200,
				body: {
					...settings,
					linkedCorpus: { kind: live ? "live" : "directory", root: "/copy" },
				},
			},
		],
		["GET /api/corpus", { status: 200, body: corpus }],
		[
			"GET /api/corpus/file",
			new LiveReply(() => ({
				status: 200,
				body: new TextEncoder().encode(currentText),
				headers: { [CORPUS_VERSION_HEADER]: currentVersion },
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

it("recovers a file’s draft after navigation and explicitly discards it", async () => {
	const { router, server } = openCorpus();
	fireEvent.change(
		await screen.findByRole("textbox", { name: "Text of CLAUDE.md" }),
		{ target: { value: "my unapplied draft\n" } },
	);
	await act(async () => {
		await router.navigate({ to: "/" });
	});
	await act(async () => {
		await router.navigate({ to: "/corpus", search: { file: "CLAUDE.md" } });
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
	expect(server.posted("/api/corpus/edits/apply")).toHaveLength(0);
	fireEvent.change(
		screen.getByRole("searchbox", { name: "Search corpus files" }),
		{ target: { value: "skills/build" } },
	);
	await waitFor(() => {
		expect(
			within(screen.getByRole("table", { name: "Corpus files" })).getAllByRole(
				"row",
			),
		).toHaveLength(2);
	});
	expect(
		within(screen.getByRole("table", { name: "Corpus files" })).getByText(
			"skills/build.md",
		),
	).toBeInTheDocument();
});

it("rereads the current baseline while keeping recovered text separate for each source", async () => {
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
		await router.navigate({ to: "/corpus", search: { file: "CLAUDE.md" } });
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
			to: "/corpus",
			search: {
				file: "CLAUDE.md",
				sourceRun: "other-source",
				sourceStep: "build",
			},
		});
	});
	expect(
		await screen.findByRole("textbox", { name: "Text of CLAUDE.md" }),
	).toHaveValue("new saved text\n");
});

it("opens the editable-copy settings path and returns with its saved source", async () => {
	const { router } = openCorpus(
		"/corpus?file=CLAUDE.md&sourceRun=source-run&sourceStep=build&start=2&end=4",
		true,
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
			file: "CLAUDE.md",
			sourceRun: "source-run",
			sourceStep: "build",
			start: 2,
			end: 4,
		});
	});
	expect(
		await screen.findByRole("region", { name: "Instruction test source" }),
	).toBeInTheDocument();
	await act(async () => {
		await router.navigate({ to: "/settings" });
	});
	expect(
		await screen.findByRole("heading", { name: "Settings", level: 1 }),
	).toBeInTheDocument();
	expect(
		screen.queryByRole("link", { name: "Return to instruction edit" }),
	).not.toBeInTheDocument();
});
