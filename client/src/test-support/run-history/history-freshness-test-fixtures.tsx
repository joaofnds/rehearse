import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import {
	stalenessBody,
	stubFetchByPath,
} from "#client/test-support/fetch-stub";
import { SHELL_BASELINE } from "#client/test-support/render-app";

const originalFetch = globalThis.fetch;

const RUN = "2026-10-01T00-00-00.000Z";

const row = {
	...new PipelineRunRowBuilder({ run: RUN, status: "COMPLETE" })
		.withExecutionProgress()
		.build(),
	shortId: "run-1",
	staleness: {
		causes: [],
		changedFiles: [],
		distance: { kind: "measured", versions: 0 },
		onlyCorpusFiles: true,
		stale: false,
		state: "available",
	},
} as const;

const history: RunHistoryResponse = {
	launches: [],
	rows: [row],
	unreadable: [],
};

const SUCCESSFUL_FRESHNESS_REPLY = { status: 200 };

interface FreshnessReplyFixture {
	readonly status: number;
}

interface PendingFreshness {
	readonly finish: (reply?: FreshnessReplyFixture) => void;
	readonly paths: readonly string[];
}

function waitingForFreshness(
	listed: RunHistoryResponse = history,
): PendingFreshness {
	const response = Promise.withResolvers<Response>();
	const paths: string[] = [];
	stubFetchByPath(new Map([...SHELL_BASELINE, ["/api/run-listing", listed]]));
	const answer = globalThis.fetch;
	const stub = Object.assign(
		async (request: string | URL | Request): Promise<Response> => {
			const { pathname } = new URL(
				request instanceof Request ? request.url : request,
				"http://localhost",
			);
			paths.push(pathname);
			return await (pathname === "/api/run-staleness"
				? response.promise
				: answer(request));
		},
		{ preconnect: originalFetch.preconnect },
	);
	globalThis.fetch = stub;
	return {
		finish: ({
			status,
		}: FreshnessReplyFixture = SUCCESSFUL_FRESHNESS_REPLY) => {
			response.resolve(Response.json(stalenessBody(listed), { status }));
		},
		paths,
	};
}

export { history, originalFetch, row, waitingForFreshness };

export type { PendingFreshness };
