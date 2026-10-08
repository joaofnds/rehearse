import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import type { CalibrationResponse } from "#client/calibration/calibration-query";
import type { ComparisonIndexResponse } from "#client/comparison/comparison-index-query";
import type { CorpusResponse } from "#client/corpus/corpus-query";
import type { SettingsReading } from "#client/launch/settings-query";
import { createAppRouter } from "#client/router";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { stubFetchByPath } from "./fetch-stub";

const NO_RUNS: RunHistoryResponse = { rows: [], launches: [], unreadable: [] };

const EMPTY_CORPUS: CorpusResponse = {
	root: "/corpus",
	digest: "ffd58d",
	files: [],
	refusals: [],
	lastEdit: {
		kind: "not-recorded",
		reason:
			"the corpus under test has no earlier version in its log to compare against",
	},
};

export const NO_GRADES: CalibrationResponse = {
	reviews: 0,
	withinOneStep: 0,
	ungraded: 0,
	next: null,
	rows: [],
	groups: [],
};

/** The settings as GET /api/settings answers them, with the ceiling given. */
export function settingsReading(
	spendCeilingUsd: number | null,
): SettingsReading {
	return {
		spendCeilingUsd,
		setCommand: "rehearse settings --spend-ceiling-usd <USD>",
		recordsDirectory: "/records",
		linkedCorpus: { kind: "live", root: "/home/operator/.claude" },
		liveCorpusRoot: "/home/operator/.claude",
		overrun: "The ceiling can be overrun by the calls in flight.",
		linkCommand: "rehearse settings --link-corpus <DIR>",
	};
}

const NO_COMPARISONS: ComparisonIndexResponse = {
	comparisons: [],
	unreadable: [],
};

/**
 * The bodies the shell reads on every route, for its nav badges, its corpus
 * card and whether the install is fresh, each typed against its own route's
 * response. The settings hold a ceiling, so a route opens on its own screen
 * rather than setup.
 */
export const SHELL_BASELINE: ReadonlyMap<string, unknown> = new Map<
	string,
	unknown
>([
	["/api/runs", NO_RUNS],
	["/api/corpus", EMPTY_CORPUS],
	["/api/comparisons", NO_COMPARISONS],
	["/api/calibration", NO_GRADES],
	["/api/settings", settingsReading(20)],
]);

export type AppRouter = ReturnType<typeof createAppRouter>;

/** Renders the app at `path`, returning its router so a test can read where it went. */
export function renderAppAt(path: string): AppRouter {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const router = createAppRouter({
		history: createMemoryHistory({ initialEntries: [path] }),
	});

	render(
		<QueryClientProvider client={client}>
			<RouterProvider router={router} />
		</QueryClientProvider>,
	);

	return router;
}

/**
 * Every route test serves the shell's baseline alongside whatever its own
 * screen reads.
 */
export function renderAppWithStub(
	path: string,
	byPath: ReadonlyMap<string, unknown>,
): AppRouter {
	stubFetchByPath(new Map<string, unknown>([...SHELL_BASELINE, ...byPath]));

	return renderAppAt(path);
}

/**
 * Answers every path but `failing` as `stubFetchByPath` answers the shell's
 * baseline, a 404 for any path outside it, and rejects that one the way an
 * unreachable server does, so a screen's error branch is observed against a
 * real rejection rather than a body that merely lacks fields.
 */
export function stubFetchFailing(failing: string): void {
	stubFetchByPath(SHELL_BASELINE);
	const answer = globalThis.fetch;
	const stub = (request: string | URL | Request): Promise<Response> => {
		const { pathname } = new URL(
			request instanceof Request ? request.url : request,
			"http://localhost",
		);
		if (pathname === failing) {
			return Promise.reject(new Error("connection refused"));
		}

		return answer(request);
	};
	stub.preconnect = fetch.preconnect;
	globalThis.fetch = stub;
}
