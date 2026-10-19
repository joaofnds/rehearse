import type { InferResponseType } from "hono/client";

import type { launchClient } from "#client/api-client";
import type HTTP_STATUS from "#client/http-status";
import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import type { Reply } from "#client/test-support/fetch-stub";
import { FakeServer } from "#client/test-support/fetch-stub";
import type LiveReply from "#client/test-support/live-reply";
import CORPUS_VERSION_HEADER from "#server/corpus-version-header";

import type { AppliedCorpusEdit } from "./corpus-edit-requests";
import { corpusResponseBody } from "./corpus-test-fixtures";
import type { ServedCorpusView } from "./corpus-view-test-harness";
import renderCorpusView from "./corpus-view-test-harness";

const LINK_COMMAND = "rehearse settings --link-corpus <directory>";

const OPENED_AT = "c63e9a".padEnd(SHA256_HEX_CHARACTERS, "0");

const STARTS_FROM = "a41c7e".padEnd(SHA256_HEX_CHARACTERS, "0");

const NEW_VERSION = "b52d8f".padEnd(SHA256_HEX_CHARACTERS, "0");

const RUN = "2026-09-03T00-00-00.000Z";

function settingsReading(kind: "live" | "directory"): SettingsReading {
	return {
		linkCommand: LINK_COMMAND,
		linkedCorpus: {
			kind,
			root: kind === "live" ? "/home/user/.claude" : "/tmp/corpus-copy",
		},
		liveCorpusRoot: "/home/user/.claude",
		overrun: "The ceiling can be overrun by the calls in flight.",
		recordsDirectory: "/records",
		setCommand: "rehearse settings --spend-ceiling-usd <USD>",
		spendCeilingUsd: 5,
	};
}

function applied(overrides: Partial<AppliedCorpusEdit> = {}): Reply {
	return {
		body: {
			invalidated: 3,
			needsComparisonManifest: false,
			previous: STARTS_FROM,
			rerun: { kind: "offered", run: RUN, stage: "discuss" },
			version: NEW_VERSION,
			...overrides,
		},
		status: 200,
	};
}

function opened(bytes: Readonly<Uint8Array>): Reply {
	return {
		body: Uint8Array.from(bytes),
		headers: { [CORPUS_VERSION_HEADER]: OPENED_AT },
		status: 200,
	};
}

function serving(
	overrides: ReadonlyMap<string, Reply | LiveReply> = new Map(),
	{ linked, source, client }: ServedCorpusView = {},
): FakeServer {
	const fetchOverrides = new Map([
		["GET /api/corpus", { body: corpusResponseBody(), status: 200 }],
		["GET /api/settings", { body: settingsReading("directory"), status: 200 }],
		[
			"GET /api/corpus/file",
			opened(new TextEncoder().encode("instructions\nkeep\n")),
		],
		[
			"POST /api/corpus/edits/review",
			{
				body: {
					applyRefusal: null,
					invalidated: 3,
					startsFrom: STARTS_FROM,
				},
				status: 200,
			},
		],
		["POST /api/corpus/edits/apply", applied()],
		...overrides,
	]);
	const server = new FakeServer(fetchOverrides);
	server.install();
	renderCorpusView({ client, linked, source });

	return server;
}

const FIRST_POSTED_REQUEST_INDEX = 0;

const INVALID_UTF8_INVALID_LEAD_BYTE = 255;

const INVALID_UTF8_LINE_FEED = 10;

const INVALID_UTF8_LOWERCASE_I = 105;

const OVERSIZE_FILE = { line: "line\n", lineCount: 2001 };

type SettingsReading = InferResponseType<
	typeof launchClient.api.settings.$get,
	typeof HTTP_STATUS.ok
>;

export {
	applied,
	FIRST_POSTED_REQUEST_INDEX,
	INVALID_UTF8_INVALID_LEAD_BYTE,
	INVALID_UTF8_LINE_FEED,
	INVALID_UTF8_LOWERCASE_I,
	LINK_COMMAND,
	NEW_VERSION,
	opened,
	OPENED_AT,
	OVERSIZE_FILE,
	RUN,
	serving,
	settingsReading,
	STARTS_FROM,
};
