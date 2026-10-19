import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";

import type {
	SessionHistoryEvent,
	SessionHistoryRequestEntry,
} from "#benchmark/session-history";
import { stubFetchByPath } from "#client/test-support/fetch-stub";

import ATTEMPT_REPORT from "./history-attempt-test-fixtures";
import EVENT_REPLIES from "./history-event-detail-fixtures";
import REQUEST_READING from "./history-request-test-fixtures";
import { SessionHistoryPage } from "./session-history-page";

const HISTORY_CACHE_EXPIRY_MS = 360_000;

const SOURCE_EXPANSION_BUTTON_COUNT = 1;

const FOURTH_REQUEST_OPTION_INDEX = 3;

const QUERY_NAMESPACE_INDEX = 0;

const REQUEST_TIMELINE_ROWS_AT_COMPACTION = 4;

const REQUEST_TIMELINE_ROWS_BEFORE_COMPACTION = 3;

async function sessionHeaderEntry(term: string): Promise<HTMLElement> {
	const header = await screen.findByRole("banner");
	const label = await within(header).findByText(term);
	const definition = label.closest("div")?.querySelector("dd");
	if (!(definition instanceof HTMLElement)) {
		throw new Error(`No ${term} entry`);
	}

	return definition;
}

const originalFetch = globalThis.fetch;

interface RenderedHistory {
	readonly client: QueryClient;
	readonly unmount: () => void;
}

function renderStandalonePage(initialEventId?: string): RenderedHistory {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const rendered = render(
		<QueryClientProvider client={client}>
			<SessionHistoryPage
				identity={{ caseId: "case-a", kind: "standalone", uuid: "attempt-a" }}
				initialEventId={initialEventId}
				revealEvents={initialEventId !== undefined}
			/>
		</QueryClientProvider>,
	);
	return { client, unmount: rendered.unmount };
}

function renderPage(initialEventId?: string): RenderedHistory {
	stubFetchByPath(
		new Map<string, unknown>([
			["/api/attempts/session/case-a/attempt-a/history", ATTEMPT_REPORT],
			...EVENT_REPLIES,
			[
				"/api/attempts/session/case-a/attempt-a/history/requests",
				REQUEST_READING,
			],
		]),
	);
	return renderStandalonePage(initialEventId);
}

const textOnlyReply: SessionHistoryRequestEntry = {
	line: 10,
	region: "attempt",
	requestId: "req-a",
	usageState: "conflict",
};

const toolCallingRequest: SessionHistoryRequestEntry = {
	line: 20,
	region: "attempt",
	requestId: "req-b",
	usageState: "conflict",
};

const ownershipEntries = [textOnlyReply, toolCallingRequest];

interface EventLocatorFixture {
	readonly line: number;
}

function eventAtLine({ line }: EventLocatorFixture): SessionHistoryEvent {
	return {
		id: `${line}:1`,
		kind: "result",
		label: `event at ${line}`,
		locator: { block: 1, line },
		measurement: { characters: 1, state: "complete" },
		region: "attempt",
		relatedEventIds: [],
		state: "recorded",
	};
}

function copyHistoryReadCache(
	warmed: Readonly<Pick<QueryClient, "getQueryCache">>,
): QueryClient {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	for (const query of warmed.getQueryCache().getAll()) {
		if (
			query.queryKey[QUERY_NAMESPACE_INDEX] !== "session-history-selection" &&
			query.queryKey[QUERY_NAMESPACE_INDEX] !== "agent-tree-selection" &&
			query.state.data !== undefined
		) {
			client.setQueryData(query.queryKey, query.state.data);
		}
	}
	return client;
}

export {
	copyHistoryReadCache,
	eventAtLine,
	FOURTH_REQUEST_OPTION_INDEX,
	HISTORY_CACHE_EXPIRY_MS,
	originalFetch,
	ownershipEntries,
	QUERY_NAMESPACE_INDEX,
	renderPage,
	renderStandalonePage,
	REQUEST_TIMELINE_ROWS_AT_COMPACTION,
	REQUEST_TIMELINE_ROWS_BEFORE_COMPACTION,
	sessionHeaderEntry,
	SOURCE_EXPANSION_BUTTON_COUNT,
	textOnlyReply,
};
