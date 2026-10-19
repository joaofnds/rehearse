import NamedHistoryBuilder from "#client/run-history/run-history-page-named-history-builder";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import type { Reply } from "#client/test-support/fetch-stub";
import { FakeServer } from "#client/test-support/fetch-stub";
import type LiveReply from "#client/test-support/live-reply";
import type { AppRouter } from "#client/test-support/render-app";
import {
	SHELL_BASELINE,
	renderAppAt,
	renderAppWithStub,
} from "#client/test-support/render-app";

import AnalysisReadingBuilder from "./analysis-reading-test-builder";
import ANALYSES from "./run-detail-analysis";
import type { HistoryRow } from "./run-detail-records";
import { RUN, stoppedAtBuild, stoppedRow } from "./run-detail-records";

const CONTRIBUTION = `/runs/${RUN}?layout=trace`;

function renderRunDetail(
	extra: ReadonlyMap<string, unknown> = new Map(),
	otherRows: readonly HistoryRow[] = [],
	page = `/runs/${RUN}`,
): AppRouter {
	const fetchReplies = new Map<string, unknown>([
		[
			"/api/runs",
			new NamedHistoryBuilder({ rows: [stoppedRow(), ...otherRows] }).build(),
		],
		[
			"/api/run-listing",
			extra.get("/api/runs") ??
				new NamedHistoryBuilder({ rows: [stoppedRow(), ...otherRows] }).build(),
		],
		[`/api/runs/${RUN}`, stoppedAtBuild()],
		[ANALYSES, new AnalysisReadingBuilder().withoutAnalysis().build()],
		...extra,
	]);

	return renderAppWithStub(page, fetchReplies);
}

/**
 * Serves run detail for the stopped run from a Fake that records what the
 * page posts, with `routes` added or replacing the defaults.
 */
function serveRunDetail(
	routes: ReadonlyMap<string, Reply | LiveReply>,
	historyBody: RunHistoryResponse = new NamedHistoryBuilder({
		rows: [stoppedRow()],
	}).build(),
	page = `/runs/${RUN}`,
): FakeServer {
	const server = new FakeServer(
		new Map<string, Reply | LiveReply>([
			...[...SHELL_BASELINE].map(([path, body]): [string, Reply] => [
				`GET ${path}`,
				{ body, status: 200 },
			]),
			["GET /api/runs", { body: historyBody, status: 200 }],
			[
				"GET /api/run-listing",
				routes.get("GET /api/runs") ?? { body: historyBody, status: 200 },
			],
			[`GET /api/runs/${RUN}`, { body: stoppedAtBuild(), status: 200 }],
			[
				`GET ${ANALYSES}`,
				{
					body: new AnalysisReadingBuilder().withoutAnalysis().build(),
					status: 200,
				},
			],
			...routes,
		]),
	);
	server.install();
	renderAppAt(page);

	return server;
}

/** Opens Results through the legacy Contribution address, as `renderRunDetail` does. */
function renderContribution(
	extra: ReadonlyMap<string, unknown> = new Map(),
	otherRows: readonly HistoryRow[] = [],
): void {
	renderRunDetail(extra, otherRows, CONTRIBUTION);
}

/** Serves Results through the legacy Contribution address, as `serveRunDetail` does. */
function serveContribution(
	routes: ReadonlyMap<string, Reply | LiveReply>,
	historyBody: RunHistoryResponse = new NamedHistoryBuilder({
		rows: [stoppedRow()],
	}).build(),
): FakeServer {
	return serveRunDetail(routes, historyBody, CONTRIBUTION);
}

export { default as ANALYSES } from "./run-detail-analysis";
export {
	CORPUS,
	RUN,
	judgedStaleness,
	stoppedAtBuild,
	stoppedRow,
} from "./run-detail-records";
export type { HistoryRow } from "./run-detail-records";
export {
	renderContribution,
	renderRunDetail,
	serveContribution,
	serveRunDetail,
};

export { default as RunRecordBuilder } from "./run-record-test-builder";
export { default as RunRecordStageBuilder } from "./run-record-stage-test-builder";
