import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import { stubFetchByPath } from "#client/test-support/fetch-stub";
import { renderWithRouter } from "#client/test-support/render-app";

import { NEW_VERSION, STARTS_FROM } from "./corpus-edit-test-fixtures";
import CorpusPage from "./corpus-page";
import type { CorpusResponse } from "./corpus-test-fixtures";
import { LIVE_SETTINGS, corpusResponseBody } from "./corpus-test-fixtures";

function renderRefusing(
	files: CorpusResponse["files"],
	refusals: CorpusResponse["refusals"] = [
		"agents/escape.md resolves outside the tree it is named under, so its bytes are not the ones that tree holds",
	],
): void {
	const body: CorpusResponse = {
		digest: undefined,
		files,
		lastEdit: {
			kind: "not-recorded",
			reason:
				"the corpus under test has no earlier version in its log to compare against",
		},
		refusals,
		root: "/home/user/.claude",
	};
	stubFetchByPath(
		new Map<string, unknown>([
			["/api/corpus", body],
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

const PREVIOUS = "e73e56".padEnd(SHA256_HEX_CHARACTERS, "0");

const CURRENT = "a41c7e".padEnd(SHA256_HEX_CHARACTERS, "0");

interface MeasuredCorpusFixture {
	readonly rows: readonly string[];
	readonly invalidated: number;
}

function measuredCorpus({
	rows,
	invalidated,
}: MeasuredCorpusFixture): CorpusResponse {
	return {
		...corpusResponseBody(),
		digest: CURRENT,
		files: [
			{
				invalidated,
				lastEditedAt: "2026-09-04T09:41:00.000Z",
				lines: 1,
				path: "CLAUDE.md",
				readBy: 23,
				sha256: "0".repeat(SHA256_HEX_CHARACTERS),
			},
		],
		lastEdit: {
			count: rows.length,
			current: CURRENT,
			kind: "measured",
			previous: PREVIOUS,
			rows,
		},
	};
}

const APPLIED_CORPUS: CorpusResponse = {
	...corpusResponseBody(),
	digest: NEW_VERSION,
	files: [
		{
			invalidated: 3,
			lastEditedAt: "2026-09-04T09:41:00.000Z",
			lines: 1,
			path: "CLAUDE.md",
			readBy: 23,
			sha256: "1".repeat(SHA256_HEX_CHARACTERS),
		},
	],
	lastEdit: {
		count: 3,
		current: NEW_VERSION,
		kind: "measured",
		previous: STARTS_FROM,
		rows: ["run:a", "run:b", "run:c"],
	},
};

export { APPLIED_CORPUS, CURRENT, PREVIOUS, measuredCorpus, renderRefusing };
