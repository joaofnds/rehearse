import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MatcherFunction } from "@testing-library/react";
import { fireEvent, screen, within } from "@testing-library/react";

import type { SettingsReading } from "#client/launch/settings-query";
import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import type { Reply } from "#client/test-support/fetch-stub";
import { FakeServer } from "#client/test-support/fetch-stub";
import LiveReply from "#client/test-support/live-reply";
import { renderWithRouter } from "#client/test-support/render-app";

import SettingsPage from "./settings-page";
import {
	LIVE_SETTINGS,
	corpus,
	twoRuns,
} from "./settings-record-test-fixtures";

const STORED: SettingsReading = { ...LIVE_SETTINGS, spendCeilingUsd: 2.5 };

const LINKED_ROOT = "/home/operator/code/omelette/.claude";

const LINKED_DIGEST = "b52d8f".padEnd(SHA256_HEX_CHARACTERS, "0");

const LINKED_SETTINGS: SettingsReading = {
	...LIVE_SETTINGS,
	linkedCorpus: { kind: "directory", root: LINKED_ROOT },
};

/**
 * A server whose settings and corpus follow the link and unlink it
 * answers, as the real routes do.
 */
function linkable(
	initially: "live" | "directory",
	overrides: ReadonlyMap<string, Reply | LiveReply> = new Map(),
): FakeServer {
	let linked = initially === "directory";
	const settings = (): SettingsReading =>
		linked ? LINKED_SETTINGS : LIVE_SETTINGS;

	return serving(
		new Map<string, Reply | LiveReply>([
			[
				"GET /api/settings",
				new LiveReply(() => ({ body: settings(), status: 200 })),
			],
			[
				"GET /api/corpus",
				new LiveReply(() => ({
					body: linked
						? { ...corpus(LINKED_DIGEST), root: LINKED_ROOT }
						: corpus("a41c7e".padEnd(SHA256_HEX_CHARACTERS, "0")),
					status: 200,
				})),
			],
			[
				"PUT /api/settings/corpus",
				new LiveReply(() => {
					linked = true;

					return { body: settings(), status: 200 };
				}),
			],
			[
				"DELETE /api/settings/corpus",
				new LiveReply(() => {
					linked = false;

					return { body: settings(), status: 200 };
				}),
			],
			...overrides,
		]),
	);
}

async function spendLimitCard(): Promise<HTMLElement> {
	return await screen.findByRole("region", { name: "Spend limit" });
}

async function findCorpusCard(): Promise<HTMLElement> {
	return await screen.findByRole("region", { name: "Corpus" });
}

function linkCorpusDirectory(directory: string): void {
	const corpusCard = screen.getByRole("region", { name: "Corpus" });
	fireEvent.change(
		within(corpusCard).getByLabelText("Corpus directory to link"),
		{ target: { value: directory } },
	);
	fireEvent.click(within(corpusCard).getByRole("button", { name: "Link" }));
}

async function keyboardShortcuts(): Promise<readonly string[]> {
	return await screen
		.findByRole("region", { name: "Keyboard" })
		.then((keyboard) =>
			within(keyboard)
				.getAllByRole("listitem")
				.map((item) => item.textContent),
		);
}

const originalFetch = globalThis.fetch;

/** The screen's subline, whose path sits in a span of its own. */
function subline(text: string): MatcherFunction {
	return (_content, element) =>
		element?.tagName === "P" && element.textContent === text;
}

const RECORDS_AT = "Local install · records at /home/operator/.rehearse/runs";

function serving(
	overrides: ReadonlyMap<string, Reply | LiveReply> = new Map(),
	view: "general" | "judges" = "general",
): FakeServer {
	const fetchOverrides = new Map([
		["GET /api/settings", { body: LIVE_SETTINGS, status: 200 }],
		[
			"GET /api/settings/records",
			{ body: { bytes: 612_000_000 }, status: 200 },
		],
		["GET /api/run-listing", { body: twoRuns(), status: 200 }],
		[
			"GET /api/corpus",
			{
				body: corpus("a41c7e".padEnd(SHA256_HEX_CHARACTERS, "0")),
				status: 200,
			},
		],
		...overrides,
	]);
	const server = new FakeServer(fetchOverrides);
	server.install();
	renderWithRouter(
		<QueryClientProvider
			client={
				new QueryClient({ defaultOptions: { queries: { retry: false } } })
			}
		>
			<SettingsPage view={view} />
		</QueryClientProvider>,
	);

	return server;
}

export {
	LINKED_DIGEST,
	LINKED_ROOT,
	RECORDS_AT,
	STORED,
	findCorpusCard,
	keyboardShortcuts,
	linkCorpusDirectory,
	linkable,
	originalFetch,
	serving,
	spendLimitCard,
	subline,
};
