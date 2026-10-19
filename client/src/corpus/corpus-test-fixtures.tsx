import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";

import type { apiClient } from "#client/api-client";
import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import { stubFetchByPath } from "#client/test-support/fetch-stub";
import { renderWithRouter } from "#client/test-support/render-app";

import CorpusPage from "./corpus-page";

const originalFetch = globalThis.fetch;

type CorpusResponse = InferResponseType<typeof apiClient.api.corpus.$get>;

function corpusResponseBody(): CorpusResponse {
	return {
		digest: "a41c7e".padEnd(SHA256_HEX_CHARACTERS, "0"),
		files: [
			{
				invalidated: 0,
				lastEditedAt: "2026-09-04T09:41:00.000Z",
				lines: 1,
				path: "CLAUDE.md",
				readBy: 23,
				sha256: "0".repeat(SHA256_HEX_CHARACTERS),
			},
		],
		lastEdit: {
			kind: "not-recorded",
			reason:
				"the corpus under test has no earlier version in its log to compare against",
		},
		refusals: [],
		root: "/home/user/.claude",
	};
}

/** The settings the screen reads to learn which corpus is linked. */
const LIVE_SETTINGS = {
	linkCommand: "rehearse settings --link-corpus <directory>",
	linkedCorpus: { kind: "live", root: "/home/user/.claude" },
	liveCorpusRoot: "/home/user/.claude",
	overrun: "The ceiling can be overrun by the calls in flight.",
	recordsDirectory: "/records",
	setCommand: "rehearse settings --spend-ceiling-usd <USD>",
	spendCeilingUsd: 5,
};

function renderPage(): void {
	stubFetchByPath(
		new Map<string, unknown>([
			["/api/corpus", corpusResponseBody()],
			["/api/settings", LIVE_SETTINGS],
		]),
	);
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	renderWithRouter(
		<QueryClientProvider client={client}>
			<CorpusPage />
		</QueryClientProvider>,
	);
}

function corpusWithLinkedSkill(): CorpusResponse {
	const corpus = corpusResponseBody();
	const [first] = corpus.files;
	if (first === undefined) {
		throw new Error("Corpus fixture needs a file");
	}
	return {
		...corpus,
		files: [...corpus.files, { ...first, path: "skills/build/SKILL.md" }],
	};
}

const UNIX_EPOCH_MS = 0;

const DRAFT_CORPUS = {
	digest: "baseline",
	files: [
		{
			invalidated: 0,
			lastEditedAt: new Date(UNIX_EPOCH_MS).toISOString(),
			lines: 1,
			path: "CLAUDE.md",
			readBy: 0,
			sha256: "123",
		},
		{
			invalidated: 0,
			lastEditedAt: new Date(UNIX_EPOCH_MS).toISOString(),
			lines: 1,
			path: "skills/build.md",
			readBy: 0,
			sha256: "456",
		},
	],
	lastEdit: { kind: "not-recorded", reason: "none" },
	refusals: [],
	root: "/copy",
};

export {
	corpusResponseBody,
	corpusWithLinkedSkill,
	DRAFT_CORPUS,
	LIVE_SETTINGS,
	originalFetch,
	renderPage,
};
export type { CorpusResponse };
