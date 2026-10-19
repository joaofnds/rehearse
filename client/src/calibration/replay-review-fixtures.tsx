import type { RunListingResponse } from "#client/run-history/run-history-query";
import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import type { Reply } from "#client/test-support/fetch-stub";
import { FakeServer } from "#client/test-support/fetch-stub";
import { SHELL_BASELINE } from "#client/test-support/render-app";
import { UNREAD_REPLAY_FIGURES } from "#client/test-support/run-figures";

import { BLIND_REVIEW, RUN } from "./stage-review-test-fixtures";

const LISTED_LINEAGE = "a".repeat(SHA256_HEX_CHARACTERS);

function serveListedReplay(): void {
	const lineage = LISTED_LINEAGE;
	const timestamp = RUN;
	const path = `/api/calibration/replays/${lineage}/${timestamp}`;
	const listing = listedReplayHistory(lineage, timestamp);
	const server = new FakeServer(
		new Map<string, Reply>([
			...[...SHELL_BASELINE].map(([url, body]): [string, Reply] => [
				`GET ${url}`,
				{ body, status: 200 },
			]),
			["GET /api/run-listing", { body: listing, status: 200 }],
			[
				`GET ${path}`,
				{
					body: {
						...BLIND_REVIEW,
						stage: { kind: "replay", lineage, timestamp },
					},
					status: 200,
				},
			],
		]),
	);
	server.install();
}

const UNLISTED_LINEAGE = "b".repeat(SHA256_HEX_CHARACTERS);

function serveUnlistedReplay(): void {
	const lineage = UNLISTED_LINEAGE;
	const timestamp = RUN;
	const path = `/api/calibration/replays/${lineage}/${timestamp}`;
	const server = new FakeServer(
		new Map<string, Reply>([
			...[...SHELL_BASELINE].map(([url, body]): [string, Reply] => [
				`GET ${url}`,
				{ body, status: 200 },
			]),
			[
				"GET /api/run-listing",
				{ body: { error: "Listing unavailable" }, status: 404 },
			],
			[
				`GET ${path}`,
				{
					body: {
						...BLIND_REVIEW,
						stage: { kind: "replay", lineage, timestamp },
					},
					status: 200,
				},
			],
		]),
	);
	server.install();
}

function listedReplayHistory(
	lineage: string,
	timestamp: string,
): RunListingResponse {
	const replay = {
		...UNREAD_REPLAY_FIGURES,
		attempt: undefined,
		caseId: "audit-log",
		checkpointShortId: "audit-log/r1/s1",
		corpusVersion: undefined,
		grade: "B",
		kind: "replay",
		lineage,
		links: [],
		recordId: `attempt:stage:${lineage}/${timestamp}`,
		shortId: "audit-log/r2",
		stage: "shape",
		status: "CONTINUE",
		timestamp,
	} satisfies RunListingResponse["rows"][number];
	const siblingTimestamp = "2026-10-01T09-00-00.000Z";
	const listing: RunListingResponse = {
		launches: [],
		rows: [
			{
				...replay,
				recordId: `attempt:stage:${lineage}/${siblingTimestamp}`,
				shortId: "audit-log/r1",
				timestamp: siblingTimestamp,
			},
			replay,
		],
		unreadable: [],
	};
	return listing;
}

export {
	LISTED_LINEAGE,
	serveListedReplay,
	serveUnlistedReplay,
	UNLISTED_LINEAGE,
};
